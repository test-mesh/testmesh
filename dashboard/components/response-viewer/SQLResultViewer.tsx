'use client';

import { useState, useMemo } from 'react';
import {
  Table,
  Download,
  Copy,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface SQLResultViewerProps {
  rows: Record<string, unknown>[];
  columns?: string[];
  rowCount?: number;
  executionTime?: number;
  query?: string;
  className?: string;
}

export default function SQLResultViewer({
  rows,
  columns: propColumns,
  rowCount,
  executionTime,
  query,
  className,
}: SQLResultViewerProps) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [copied, setCopied] = useState(false);

  // Derive columns from first row if not provided
  const columns = useMemo(() => {
    if (propColumns) return propColumns;
    if (rows.length === 0) return [];
    return Object.keys(rows[0]);
  }, [rows, propColumns]);

  // Filter rows based on search
  const filteredRows = useMemo(() => {
    if (!search) return rows;

    return rows.filter((row) =>
      columns.some((col) => {
        const value = row[col];
        return String(value).toLowerCase().includes(search.toLowerCase());
      })
    );
  }, [rows, columns, search]);

  // Sort rows
  const sortedRows = useMemo(() => {
    if (!sortColumn) return filteredRows;

    return [...filteredRows].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];

      if (aVal === null || aVal === undefined) return sortDirection === 'asc' ? -1 : 1;
      if (bVal === null || bVal === undefined) return sortDirection === 'asc' ? 1 : -1;

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }

      const aStr = String(aVal);
      const bStr = String(bVal);
      return sortDirection === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });
  }, [filteredRows, sortColumn, sortDirection]);

  // Paginate
  const paginatedRows = useMemo(() => {
    const start = page * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, page, pageSize]);

  const totalPages = Math.ceil(sortedRows.length / pageSize);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const formatValue = (value: unknown): string => {
    if (value === null) return 'NULL';
    if (value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const copyAsCSV = async () => {
    const header = columns.join(',');
    const body = sortedRows
      .map((row) =>
        columns
          .map((col) => {
            const val = formatValue(row[col]);
            return val.includes(',') || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
          })
          .join(',')
      )
      .join('\n');

    await navigator.clipboard.writeText(`${header}\n${body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const downloadCSV = () => {
    const header = columns.join(',');
    const body = sortedRows
      .map((row) =>
        columns
          .map((col) => {
            const val = formatValue(row[col]);
            return val.includes(',') || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
          })
          .join(',')
      )
      .join('\n');

    const blob = new Blob([`${header}\n${body}`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'query-results.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (rows.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-12 text-muted-foreground', className)}>
        <Table className="w-12 h-12 mb-4 opacity-50" />
        <p className="text-sm">No rows returned</p>
        {query && (
          <p className="text-xs mt-2 font-mono max-w-md truncate">{query}</p>
        )}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-2 border-b gap-2">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Search results..."
              className="h-7 pl-7 w-48 text-xs"
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {sortedRows.length} row{sortedRows.length !== 1 ? 's' : ''}
            {executionTime !== undefined && ` · ${executionTime}ms`}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={copyAsCSV}
            className="h-7 text-xs"
          >
            {copied ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={downloadCSV}
            className="h-7 text-xs"
          >
            <Download className="w-3 h-3 mr-1" />
            CSV
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/80 backdrop-blur">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-10">
                #
              </th>
              {columns.map((col) => (
                <th
                  key={col}
                  className="px-2 py-1.5 text-left font-medium cursor-pointer hover:bg-muted transition-colors"
                  onClick={() => handleSort(col)}
                >
                  <div className="flex items-center gap-1">
                    <span className="truncate">{col}</span>
                    {sortColumn === col ? (
                      sortDirection === 'asc' ? (
                        <ArrowUp className="w-3 h-3 shrink-0" />
                      ) : (
                        <ArrowDown className="w-3 h-3 shrink-0" />
                      )
                    ) : (
                      <ArrowUpDown className="w-3 h-3 shrink-0 opacity-30" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map((row, idx) => (
              <tr
                key={idx}
                className="border-b hover:bg-muted/30 transition-colors"
              >
                <td className="px-2 py-1.5 text-muted-foreground">
                  {page * pageSize + idx + 1}
                </td>
                {columns.map((col) => {
                  const value = row[col];
                  const isNull = value === null;

                  return (
                    <td
                      key={col}
                      className={cn(
                        'px-2 py-1.5 font-mono max-w-xs truncate',
                        isNull && 'text-muted-foreground italic'
                      )}
                      title={formatValue(value)}
                    >
                      {formatValue(value)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between p-2 border-t">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Rows per page:</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v));
                setPage(0);
              }}
            >
              <SelectTrigger className="h-7 w-16 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100].map((size) => (
                  <SelectItem key={size} value={String(size)} className="text-xs">
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground mr-2">
              Page {page + 1} of {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage(0)}
              disabled={page === 0}
              className="h-7 w-7 p-0"
            >
              <ChevronsLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="h-7 w-7 p-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="h-7 w-7 p-0"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage(totalPages - 1)}
              disabled={page >= totalPages - 1}
              className="h-7 w-7 p-0"
            >
              <ChevronsRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
