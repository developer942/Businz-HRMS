import React, { useState, useEffect } from 'react';
import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react';

export interface StandardTablePaginationProps {
  currentPage: number;
  totalEntries: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: number[];
}

export const StandardTablePagination: React.FC<StandardTablePaginationProps> = ({
  currentPage,
  totalEntries,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [5, 10] // strictly [5, 10] as per design system specification
}) => {
  const [jumpPage, setJumpPage] = useState<string>('');
  const [isMobile, setIsMobile] = useState<boolean>(() => 
    typeof window !== 'undefined' ? window.innerWidth <= 1024 : false
  );

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Standard table pagination is strictly disabled across all mobile screens
  if (isMobile) {
    return null;
  }
  const totalPages = Math.max(1, Math.ceil(totalEntries / pageSize));

  // Determine displayed entry bounds
  const startEntry = totalEntries === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endEntry = Math.min(currentPage * pageSize, totalEntries);

  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const pageNum = parseInt(jumpPage, 10);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
      onPageChange(pageNum);
      setJumpPage('');
    }
  };

  // Generate pagination page numbers (with max 5 visible items around current)
  const getPageNumbers = () => {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);

    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

  return (
    <div className="standard-pagination-footer">
      {/* Left: Rows-per-page restricted strictly to [5, 10] + Showing X to Y of Z entries */}
      <div className="standard-pagination-left">
        <label htmlFor="standard-page-size-select" style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
          Rows per page:
        </label>
        <select
          id="standard-page-size-select"
          className="standard-pagination-select"
          value={pageSize}
          onChange={(e) => {
            const newSize = Number(e.target.value);
            onPageSizeChange(newSize);
            onPageChange(1);
          }}
        >
          {pageSizeOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <span>
          Showing <strong>{startEntry}</strong> to <strong>{endEntry}</strong> of <strong>{totalEntries}</strong> entries
        </span>
      </div>

      {/* Right: Page controls (<< < 1 2 3 > >>) + Go to page */}
      <div className="standard-pagination-right">
        <div className="standard-pagination-controls">
          <button
            className="standard-page-btn"
            onClick={() => onPageChange(1)}
            disabled={currentPage <= 1}
            title="First page"
            aria-label="First page"
          >
            <ChevronsLeft size={16} />
          </button>
          <button
            className="standard-page-btn"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            title="Previous page"
            aria-label="Previous page"
          >
            <ChevronLeft size={16} />
          </button>

          {getPageNumbers().map((p) => (
            <button
              key={p}
              className={`standard-page-btn ${p === currentPage ? 'active' : ''}`}
              onClick={() => onPageChange(p)}
              aria-current={p === currentPage ? 'page' : undefined}
            >
              {p}
            </button>
          ))}

          <button
            className="standard-page-btn"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            title="Next page"
            aria-label="Next page"
          >
            <ChevronRight size={16} />
          </button>
          <button
            className="standard-page-btn"
            onClick={() => onPageChange(totalPages)}
            disabled={currentPage >= totalPages}
            title="Last page"
            aria-label="Last page"
          >
            <ChevronsRight size={16} />
          </button>
        </div>

        {/* Go to page [ ] and Go › */}
        <form className="standard-goto-form" onSubmit={handleJumpSubmit}>
          <label htmlFor="standard-goto-input" style={{ fontSize: '0.85rem' }}>
            Go to page
          </label>
          <input
            id="standard-goto-input"
            type="number"
            inputMode="numeric"
            pattern="[0-9]*"
            min={1}
            max={totalPages}
            className="standard-goto-input"
            value={jumpPage}
            placeholder={String(currentPage)}
            onChange={(e) => setJumpPage(e.target.value)}
          />
          <button type="submit" className="standard-goto-btn">
            Go ›
          </button>
        </form>
      </div>
    </div>
  );
};
