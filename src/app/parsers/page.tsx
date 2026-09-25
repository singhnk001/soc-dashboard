'use client';

import React, { useState, useEffect } from 'react';
import useSWR, { mutate } from 'swr';
import { Loader2, Code, Plus, Trash2, Save } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function ParsersPage() {
  const { data: parsers, isLoading } = useSWR('/api/parsers', fetcher);
  const [isCreating, setIsCreating] = useState(false);
  const [role, setRole] = useState<string>('admin');

  useEffect(() => {
    const getCookie = (name: string) => {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) return parts.pop()?.split(';').shift();
      return 'admin';
    };
    setRole(getCookie('soc_session') || 'admin');
  }, []);

  const [formData, setFormData] = useState({ name: '', regex: '', description: '', log_source: '' });
  const [sampleLog, setSampleLog] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch unique log sources for dropdown
  const { data: sourcesData } = useSWR('/api/sources', fetcher);
  const uniqueSources = Array.from(new Set(sourcesData?.map((s: any) => s.sources.split(',')).flat().map((s: string) => s.trim()) || []));

    const getTestResults = () => {
    if (!formData.regex || !sampleLog) return null;
    try {
      const jsRegexStr = formData.regex.replace(/\(\?P</g, '(?<');
      const regex = new RegExp(jsRegexStr, 'g');
      
      const results: Record<string, string> = {};
      let match;
      let matchCount = 0;
      let prevLastIndex = -1;
      
      while ((match = regex.exec(sampleLog)) !== null) {
        if (regex.lastIndex === prevLastIndex) break;
        prevLastIndex = regex.lastIndex;
        matchCount++;
        if (match.groups) {
          Object.entries(match.groups).forEach(([k, v]) => {
            if (v !== undefined) results[k] = v;
          });
        }
      }
      
      if (matchCount === 0) return { error: 'No matches found.' };
      if (Object.keys(results).length === 0) return { error: 'Matched, but no named capture groups (?P<name>pattern) extracted data.' };
      
      return { data: results, count: matchCount };
    } catch (e: any) {
      return { error: `Invalid Regex: ${e.message}` };
    }
  };

  const testResult = getTestResults();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await fetch('/api/parsers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, active: true, log_source: formData.log_source || null })
      });
      mutate('/api/parsers');
      setIsCreating(false);
      setFormData({ name: '', regex: '', description: '', log_source: '' });
      setSampleLog('');
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/parsers/${id}`, { method: 'DELETE' });
      mutate('/api/parsers');
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="p-6 space-y-6 bg-[#0f1219] min-h-screen text-white">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Custom Log Parsers</h1>
          <p className="text-gray-400 text-sm mt-1">Define Regex patterns with named capture groups to extract key=value fields from raw logs.</p>
        </div>
        {role !== 'readonly' && role !== 'l1' && (
        <button 
          onClick={() => setIsCreating(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <Plus size={18} /> New Parser
        </button>
        )}
      </div>

      {isCreating && (
        <form onSubmit={handleSubmit} className="bg-[#1a1f2e] border border-gray-800 rounded-lg p-5 mb-6">
          <h3 className="text-lg font-bold mb-4">Create New Parser</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Parser Name</label>
              <input 
                required type="text" 
                placeholder="e.g., Nginx Access Logs"
                className="w-full bg-[#11141e] border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none"
                value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Regex Pattern (Use named groups like <code className="text-blue-400">(?P&lt;ip&gt;\d+\.\d+\.\d+\.\d+)</code>)</label>
              <input 
                required type="text" 
                placeholder={`(?P<src_ip>\\d+\\.\\d+\\.\\d+\\.\\d+) - - \\[.*\\] "(?P<method>\\w+).*`}
                className="w-full bg-[#11141e] border border-gray-700 rounded p-2 text-white font-mono text-sm focus:border-blue-500 outline-none"
                value={formData.regex} onChange={e => setFormData({...formData, regex: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Description (Optional)</label>
              <input 
                type="text" 
                placeholder="Extracts source IP and HTTP method from Nginx logs"
                className="w-full bg-[#11141e] border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none"
                value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Target Log Source (Optional)</label>
              <select 
                className="w-full bg-[#11141e] border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none"
                value={formData.log_source} onChange={e => setFormData({...formData, log_source: e.target.value})}
              >
                <option value="">Any Log Source (Global Parser)</option>
                {uniqueSources.map((source, i) => (
                  <option key={i} value={source as string}>{source as string}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">If selected, this parser will only run for logs originating from this specific source.</p>
            </div>
          </div>

          {/* Live Parser Tester */}
          <div className="space-y-4 border-l border-gray-800 pl-6">
              <div>
                <label className="block text-sm font-medium text-blue-400 mb-1 flex items-center gap-2">
                  <Code size={16} /> Live Parser Validator
                </label>
                <textarea 
                  placeholder="Paste a sample raw log here (e.g. XML, Syslog) to test your regex..."
                  className="w-full h-32 bg-[#11141e] border border-gray-700 rounded p-2 text-white font-mono text-xs focus:border-blue-500 outline-none resize-none"
                  value={sampleLog} onChange={e => setSampleLog(e.target.value)}
                />
              </div>
              
              <div className="h-48 bg-[#0a0e1a] border border-gray-800 rounded p-3 overflow-y-auto">
                {!sampleLog || !formData.regex ? (
                  <div className="h-full flex items-center justify-center text-gray-500 text-sm text-center">
                    Enter a regex pattern and a sample log to see live extraction results.
                  </div>
                ) : testResult?.error ? (
                  <div className="text-red-400 text-sm font-mono whitespace-pre-wrap">{testResult.error}</div>
                ) : (
                  <div>
                    <div className="text-xs text-green-400 font-medium mb-2 uppercase tracking-wider">
                      Successfully Extracted ({testResult?.count} matches)
                    </div>
                    <table className="w-full text-left text-xs font-mono">
                      <tbody className="divide-y divide-gray-800">
                        {testResult?.data && Object.entries(testResult.data).map(([k, v]) => (
                          <tr key={k}>
                            <td className="py-1 text-blue-400 pr-4">{k}</td>
                            <td className="py-1 text-gray-300 break-all">{v}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex gap-2 justify-end pt-4 mt-4 border-t border-gray-800">
            <button type="button" onClick={() => { setIsCreating(false); setSampleLog(''); }} className="px-4 py-2 text-gray-400 hover:text-white transition-colors">Cancel</button>
            <button type="submit" disabled={isSubmitting || !!testResult?.error} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded flex items-center gap-2 transition-colors disabled:opacity-50">
              <Save size={16} /> Save Parser
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="py-12 flex justify-center bg-[#1a1f2e] border border-gray-800 rounded-lg">
          <Loader2 className="animate-spin text-blue-500" size={32} />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {parsers?.length === 0 && !isCreating && (
            <div className="col-span-full p-8 text-center text-gray-500 bg-[#1a1f2e] border border-gray-800 rounded-lg">
              No custom parsers defined. Create one to start extracting fields automatically!
            </div>
          )}
          {parsers?.map((parser: any) => (
            <div key={parser.id} className="bg-[#1a1f2e] border border-gray-800 rounded-lg p-5 flex flex-col">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <div className="bg-purple-500/10 p-2 rounded-lg text-purple-400">
                    <Code size={20} />
                  </div>
                  <h3 className="text-lg font-bold">{parser.name}</h3>
                </div>
                {role !== 'readonly' && role !== 'l1' && (
                <button 
                  onClick={() => handleDelete(parser.id)}
                  className="text-gray-500 hover:text-red-500 transition-colors p-1"
                  title="Delete Parser"
                >
                  <Trash2 size={16} />
                </button>
                )}
              </div>
              
              {parser.description && <p className="text-gray-400 text-sm mb-4">{parser.description}</p>}
              
              {parser.log_source ? (
                <div className="mb-4">
                  <span className="text-xs bg-purple-500/10 text-purple-400 px-2 py-1 rounded border border-purple-500/20">
                    Target: {parser.log_source}
                  </span>
                </div>
              ) : (
                <div className="mb-4">
                  <span className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded">Global Parser (All Sources)</span>
                </div>
              )}
              
              <div className="mt-auto">
                <div className="text-xs text-gray-500 mb-1">Regex Pattern</div>
                <div className="bg-[#11141e] border border-gray-700 rounded p-3 font-mono text-sm text-green-400 overflow-x-auto whitespace-nowrap">
                  {parser.regex}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

