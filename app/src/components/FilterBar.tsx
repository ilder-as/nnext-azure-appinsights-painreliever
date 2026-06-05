import { useDashboard } from "@/state/dashboard";
import { fmtInt } from "@/lib/format";
import { SearchBox } from "./SearchBox";
import { FilterMenu } from "./FilterMenu";
import { DimensionFilter } from "./DimensionFilter";
import { FilterChips } from "./FilterChips";

/**
 * The ".filterbar" plus the ".active-chips" row beneath it. Composes the search
 * box, the event-types filter dropdown, the live "events match" count, the
 * clear-filters button, and the active-filter chips.
 *
 * The clear-filters button is shown when any filter (events / dimensions /
 * search) OR the failures-only view is active; clicking calls clearAll().
 */
export function FilterBar() {
  const { agg, anyFilterActive, filters, clearAll } = useDashboard();

  const showClear = anyFilterActive || filters.failOnly;

  return (
    <>
      <div className="filterbar">
        <SearchBox />

        <FilterMenu />

        <DimensionFilter />

        <button
          className="clear-filters"
          style={{ display: showClear ? "inline-flex" : "none" }}
          onClick={clearAll}
        >
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M18 6L6 18M6 6l12 12"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          Clear filters
        </button>

        <div className="filter-bar-right">
          <span className="result-count">
            <b className="num">{fmtInt(agg.total)}</b> events match
          </span>
        </div>
      </div>

      <FilterChips />
    </>
  );
}
