import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { pageWindow } from "@/lib/pageWindow";

interface TablePaginationProps {
  page: number;
  pageCount: number;
  from: number;
  to: number;
  total: number;
  onPageChange: (page: number) => void;
  /** What is being counted, e.g. "orders" */
  label?: string;
}

export default function TablePagination({
  page,
  pageCount,
  from,
  to,
  total,
  onPageChange,
  label = "results",
}: TablePaginationProps) {
  if (total === 0) return null;

  const pages = pageWindow(page, pageCount);

  return (
    <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
      <p className="text-sm text-muted-foreground">
        Showing {from}–{to} of {total} {label}
      </p>

      {pageCount > 1 && (
        <Pagination className="mx-0 w-auto justify-end">
          <PaginationContent className="flex-wrap">
            <PaginationItem>
              <PaginationPrevious
                href="#"
                aria-disabled={page === 1}
                className={page === 1 ? "pointer-events-none opacity-50" : ""}
                onClick={(e) => {
                  e.preventDefault();
                  onPageChange(page - 1);
                }}
              />
            </PaginationItem>

            {pages.map((p, index) => (
              <PaginationItem key={p}>
                {/* a gap in the sequence means pages were skipped */}
                {index > 0 && p - pages[index - 1] > 1 && (
                  <span className="px-1 text-muted-foreground">…</span>
                )}
                <PaginationLink
                  href="#"
                  isActive={p === page}
                  onClick={(e) => {
                    e.preventDefault();
                    onPageChange(p);
                  }}
                >
                  {p}
                </PaginationLink>
              </PaginationItem>
            ))}

            <PaginationItem>
              <PaginationNext
                href="#"
                aria-disabled={page === pageCount}
                className={
                  page === pageCount ? "pointer-events-none opacity-50" : ""
                }
                onClick={(e) => {
                  e.preventDefault();
                  onPageChange(page + 1);
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
