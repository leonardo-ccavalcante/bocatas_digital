import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/lib/trpc';
import type { LogEntry } from '../../lib/logging-types';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export function LogsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [levelFilter, setLevelFilter] = useState<LogLevel | 'all'>('all');
  const [correlationIdFilter, setCorrelationIdFilter] = useState('');
  const [userIdFilter, setUserIdFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Fetch logs
  const { data: logsData, isLoading } = trpc.logging.getLogs.useQuery({
    limit: 1000,
    offset: 0,
  });

  // Fetch stats
  const { data: statsData } = trpc.logging.getStats.useQuery();

  // Filter and paginate logs
  const filteredLogs = useMemo(() => {
    if (!logsData?.logs) return [];

    return logsData.logs.filter(log => {
      // Level filter
      if (levelFilter !== 'all' && log.level !== levelFilter) return false;

      // Search filter
      if (searchTerm && !log.message.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }

      // Correlation ID filter
      if (correlationIdFilter && log.correlationId !== correlationIdFilter) return false;

      // User ID filter
      if (userIdFilter && log.userId !== userIdFilter) return false;

      return true;
    });
  }, [logsData?.logs, levelFilter, searchTerm, correlationIdFilter, userIdFilter]);

  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredLogs.length / pageSize);

  // Export to CSV
  const handleExport = async () => {
    if (!filteredLogs.length) return;

    const csv = convertToCSV(filteredLogs);
    downloadCSV(csv, 'logs.csv');
  };

  // Get badge color by level
  const getLevelColor = (level: LogLevel) => {
    switch (level) {
      case 'debug':
        return 'bg-gray-200 text-gray-800';
      case 'info':
        return 'bg-blue-200 text-blue-800';
      case 'warn':
        return 'bg-yellow-200 text-yellow-800';
      case 'error':
        return 'bg-red-200 text-red-800';
      default:
        return 'bg-gray-200 text-gray-800';
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">System Logs</h1>
        <p className="text-gray-600 mt-2">View and filter system logs with correlation ID tracing</p>
      </div>

      {/* Stats */}
      {statsData && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Logs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statsData.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Errors</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{statsData.byLevel.error}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Warnings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{statsData.byLevel.warn}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Unique Requests</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statsData.uniqueCorrelationIds}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Active Users</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statsData.uniqueUsers}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Search */}
            <div>
              <label className="text-sm font-medium">Search Message</label>
              <Input
                placeholder="Search logs..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="mt-1"
              />
            </div>

            {/* Level Filter */}
            <div>
              <label className="text-sm font-medium">Log Level</label>
              <Select value={levelFilter} onValueChange={(v) => setLevelFilter(v as LogLevel | 'all')}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="debug">Debug</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warn">Warning</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Correlation ID Filter */}
            <div>
              <label className="text-sm font-medium">Correlation ID</label>
              <Input
                placeholder="Filter by correlation ID..."
                value={correlationIdFilter}
                onChange={e => setCorrelationIdFilter(e.target.value)}
                className="mt-1"
              />
            </div>

            {/* User ID Filter */}
            <div>
              <label className="text-sm font-medium">User ID</label>
              <Input
                placeholder="Filter by user ID..."
                value={userIdFilter}
                onChange={e => setUserIdFilter(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div className="flex gap-2 justify-between items-center">
            <div className="text-sm text-gray-600">
              Showing {paginatedLogs.length} of {filteredLogs.length} logs
            </div>
            <Button onClick={handleExport} variant="outline" disabled={!filteredLogs.length}>
              Export to CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Logs</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-gray-600">Loading logs...</div>
          ) : paginatedLogs.length === 0 ? (
            <div className="text-center py-8 text-gray-600">No logs found</div>
          ) : (
            <div className="space-y-4">
              {paginatedLogs.map((log, idx) => (
                <div key={idx} className="border rounded-lg p-4 space-y-2 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className={getLevelColor(log.level)}>{log.level.toUpperCase()}</Badge>
                      <span className="font-medium">{log.message}</span>
                    </div>
                    <span className="text-sm text-gray-500">{new Date(log.timestamp).toLocaleString()}</span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                    {log.correlationId && (
                      <div>
                        <span className="text-gray-600">Correlation ID:</span>
                        <div className="font-mono text-xs bg-gray-100 p-1 rounded mt-1 break-all">
                          {log.correlationId}
                        </div>
                      </div>
                    )}
                    {log.userId && (
                      <div>
                        <span className="text-gray-600">User:</span>
                        <div className="font-mono text-xs">{log.userId}</div>
                      </div>
                    )}
                    {log.duration !== undefined && (
                      <div>
                        <span className="text-gray-600">Duration:</span>
                        <div className="font-mono text-xs">{log.duration}ms</div>
                      </div>
                    )}
                    {log.success !== undefined && (
                      <div>
                        <span className="text-gray-600">Status:</span>
                        <div className={`font-mono text-xs ${log.success ? 'text-green-600' : 'text-red-600'}`}>
                          {log.success ? 'Success' : 'Failed'}
                        </div>
                      </div>
                    )}
                  </div>

                  {log.errorMessage && (
                    <div className="bg-red-50 border border-red-200 rounded p-2">
                      <div className="text-sm font-medium text-red-800">Error: {log.errorMessage}</div>
                      {log.errorStack && (
                        <details className="mt-2">
                          <summary className="text-xs text-red-600 cursor-pointer">Stack trace</summary>
                          <pre className="text-xs bg-red-100 p-2 rounded mt-1 overflow-auto max-h-40">
                            {log.errorStack}
                          </pre>
                        </details>
                      )}
                    </div>
                  )}

                  {/* Additional metadata */}
                  {Object.keys(log as any).filter(k => !['level', 'message', 'timestamp', 'correlationId', 'userId', 'duration', 'success', 'errorMessage', 'errorStack'].includes(k)).length > 0 && (
                    <details className="text-xs">
                      <summary className="text-gray-600 cursor-pointer">Additional metadata</summary>
                      <pre className="bg-gray-100 p-2 rounded mt-1 overflow-auto max-h-40">
                        {JSON.stringify(
                          Object.fromEntries(
                            Object.entries(log).filter(([k]) =>
                              !['level', 'message', 'timestamp', 'correlationId', 'userId', 'duration', 'success', 'errorMessage', 'errorStack'].includes(k)
                            )
                          ),
                          null,
                          2
                        )}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <div className="text-sm text-gray-600">
                Page {currentPage} of {totalPages}
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  variant="outline"
                >
                  Previous
                </Button>
                <Button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  variant="outline"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Helper functions
function convertToCSV(logs: any[]): string {
  const headers = ['timestamp', 'level', 'message', 'correlationId', 'userId', 'duration', 'success', 'errorMessage'];
  const rows = logs.map(log =>
    headers.map(h => {
      const value = log[h];
      if (value === undefined || value === null) return '';
      if (typeof value === 'string') return `"${value.replace(/"/g, '""')}`;
      return String(value);
    }).join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}

function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
