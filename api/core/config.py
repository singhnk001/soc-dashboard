"""
api/core/config.py
==================
Centralized application settings and environment variables.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load root .env file
ROOT_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(dotenv_path=ROOT_DIR / ".env")

class Settings:
    # Server configuration
    API_HOST: str = os.environ.get("API_HOST", "0.0.0.0")
    API_PORT: int = int(os.environ.get("API_PORT", "8002"))
    
    # Database connection parameters
    DB_HOST: str = os.environ.get("DB_HOST", "localhost")
    DB_PORT: str = os.environ.get("DB_PORT", "5432")
    DB_USER: str = os.environ.get("DB_USER", "postgres")
    DB_PASSWORD: str = os.environ.get("DB_PASSWORD", "Singhnk.001k")
    DB_NAME: str = os.environ.get("DB_NAME", "soc_db")
    
    @property
    def db_conninfo(self) -> str:
        return (
            f"host={self.DB_HOST} port={self.DB_PORT} user={self.DB_USER} "
            f"password={self.DB_PASSWORD} dbname={self.DB_NAME}"
        )
    
    # Security & Tokens
    SECRET_KEY: str = os.environ.get("SECRET_KEY", "soc-dashboard-fallback-secret-key-32chars")
    
    # External Threat Intelligence APIs
    VIRUSTOTAL_API_KEY: str = os.environ.get("VIRUSTOTAL_API_KEY", "")
    OTX_API_KEY: str = os.environ.get("OTX_API_KEY", "")
    ABUSEIPDB_API_KEY: str = os.environ.get("ABUSEIPDB_API_KEY", "")
    
    # Webhooks & SOAR
    SLACK_WEBHOOK_URL: str = os.environ.get("SLACK_WEBHOOK_URL", "")
    TEAMS_WEBHOOK_URL: str = os.environ.get("TEAMS_WEBHOOK_URL", "")

settings = Settings()
