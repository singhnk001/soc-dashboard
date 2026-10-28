"""
api/core/database.py
====================
PostgreSQL Connection pooling, cursor/connection wrappers, and get_db() dependency.
"""

from contextlib import contextmanager
from typing import Generator
import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
from api.core.config import settings

_pool: "ConnectionPool | None" = None

def get_pool() -> ConnectionPool:
    """Returns or initializes the database connection pool."""
    global _pool
    if _pool is None or _pool.closed:
        _pool = ConnectionPool(
            conninfo=settings.db_conninfo,
            kwargs={"row_factory": dict_row},
            min_size=5,
            max_size=20,
            max_waiting=100,
            reconnect_timeout=30,
            open=False,
        )
        _pool.open(wait=True, timeout=30)
    return _pool

def close_pool():
    """Closes connection pool on application shutdown."""
    global _pool
    if _pool is not None and not _pool.closed:
        _pool.close()
        _pool = None

class DictRow(dict):
    """PostgreSQL row returned as a dict that also supports integer index access."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._values = list(self.values())
        
    def __getitem__(self, item):
        if isinstance(item, int):
            return self._values[item]
        return super().__getitem__(item)

def dict_row_factory(cursor):
    dict_maker = dict_row(cursor)
    def make_row(values):
        return DictRow(dict_maker(values))
    return make_row

class PgCursorWrapper:
    """Wrapper around psycopg cursor for transparent query execution."""
    def __init__(self, cur):
        self.cur = cur

    def execute(self, query: str, params=None):
        if params is not None:
            self.cur.execute(query, params)
        else:
            self.cur.execute(query)
        return self

    def executemany(self, query: str, params_list):
        self.cur.executemany(query, params_list)
        return self
        
    def executescript(self, script: str):
        self.cur.execute(script)
        return self

    def fetchone(self):
        return self.cur.fetchone()

    def fetchall(self):
        return self.cur.fetchall()
        
    def close(self):
        self.cur.close()
        
    @property
    def rowcount(self) -> int:
        return self.cur.rowcount

class PgConnWrapper:
    """Wrapper managing connection lifecycle and pool returns."""
    def __init__(self, conn, pool=None):
        self.conn = conn
        self._pool = pool
        self._returned = False

    def execute(self, query: str, params=None):
        cur = self.conn.cursor()
        if params is not None:
            cur.execute(query, params)
        else:
            cur.execute(query)
        return PgCursorWrapper(cur)
        
    def executemany(self, query: str, params_list):
        cur = self.conn.cursor()
        cur.executemany(query, params_list)
        return PgCursorWrapper(cur)

    def cursor(self):
        return PgCursorWrapper(self.conn.cursor())

    def commit(self):
        self.conn.commit()

    def rollback(self):
        self.conn.rollback()

    def close(self):
        if self._returned:
            return
        self._returned = True
        try:
            if self._pool is not None:
                self._pool.putconn(self.conn)
            else:
                self.conn.close()
        except Exception:
            try:
                self.conn.close()
            except Exception:
                pass

    def __del__(self):
        if not getattr(self, '_returned', False):
            self.close()

    def __enter__(self):
        return self
        
    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is None:
            try:
                self.commit()
            except Exception:
                self.rollback()
        else:
            try:
                self.rollback()
            except Exception:
                pass
        self.close()

def get_db() -> PgConnWrapper:
    """
    Acquires a pooled connection.
    Always use with a context manager:
        with get_db() as conn:
            conn.execute(...)
    """
    try:
        pool = get_pool()
        raw = pool.getconn(timeout=10.0)
        raw.row_factory = dict_row_factory
        try:
            raw.execute("SELECT 1")
        except Exception:
            try:
                pool.putconn(raw)
            except Exception:
                pass
            raw = psycopg.connect(
                host=settings.DB_HOST, port=settings.DB_PORT,
                user=settings.DB_USER, password=settings.DB_PASSWORD,
                dbname=settings.DB_NAME, row_factory=dict_row_factory
            )
            return PgConnWrapper(raw)
        return PgConnWrapper(raw, pool=pool)
    except Exception:
        raw = psycopg.connect(
            host=settings.DB_HOST, port=settings.DB_PORT,
            user=settings.DB_USER, password=settings.DB_PASSWORD,
            dbname=settings.DB_NAME, row_factory=dict_row_factory
        )
        return PgConnWrapper(raw)
