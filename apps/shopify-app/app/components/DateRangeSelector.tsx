import { useCallback } from "react";

// Date range presets
export type PresetKey = "today" | "yesterday" | "last_month" | "this_month" | "this_quarter" | "this_year";

export const DATE_PRESETS: { label: string; key: PresetKey }[] = [
  { label: "Today", key: "today" },
  { label: "Yesterday", key: "yesterday" },
  { label: "Last Month", key: "last_month" },
  { label: "This Month", key: "this_month" },
  { label: "This Quarter", key: "this_quarter" },
  { label: "This Year", key: "this_year" },
];

export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function formatDisplayDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getQuarterStart(date: Date): Date {
  const quarter = Math.floor(date.getMonth() / 3);
  return new Date(date.getFullYear(), quarter * 3, 1);
}

function getQuarterEnd(date: Date): Date {
  const quarter = Math.floor(date.getMonth() / 3);
  // Quarter end is the last day of the quarter's final month
  // Q1: March 31 (month 2), Q2: June 30 (month 5), Q3: Sep 30 (month 8), Q4: Dec 31 (month 11)
  const endMonth = quarter * 3 + 2; // 2, 5, 8, or 11
  return new Date(date.getFullYear(), endMonth + 1, 0); // Day 0 of next month = last day of this month
}

export function getDateRange(key: PresetKey): { start: string; end: string } {
  const today = new Date();

  switch (key) {
    case "today":
      return { start: formatDate(today), end: formatDate(today) };

    case "yesterday": {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return { start: formatDate(yesterday), end: formatDate(yesterday) };
    }

    case "last_month": {
      const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
      return { start: formatDate(lastMonthStart), end: formatDate(lastMonthEnd) };
    }

    case "this_month": {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: formatDate(monthStart), end: formatDate(today) };
    }

    case "this_quarter": {
      const quarterStart = getQuarterStart(today);
      const quarterEnd = getQuarterEnd(today);
      return { start: formatDate(quarterStart), end: formatDate(quarterEnd) };
    }

    case "this_year": {
      const yearStart = new Date(today.getFullYear(), 0, 1);
      return { start: formatDate(yearStart), end: formatDate(today) };
    }
  }
}

export function getPresetLabel(startDate: string, endDate: string): string | null {
  for (const preset of DATE_PRESETS) {
    const range = getDateRange(preset.key);
    if (range.start === startDate && range.end === endDate) {
      return preset.label;
    }
  }
  return null;
}

export function getMonthFromDateRange(startDate: string): { year: number; month: number } {
  const date = new Date(startDate + "T00:00:00");
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
  };
}

interface DateRangeSelectorProps {
  startDate: string;
  endDate: string;
  onDateChange: (start: string, end: string, presetKey?: PresetKey) => void;
  selectedPreset?: PresetKey | null;
  popoverId?: string;
}

export function DateRangeSelector({
  startDate,
  endDate,
  onDateChange,
  selectedPreset,
  popoverId = "date-popover",
}: DateRangeSelectorProps) {
  // Use selectedPreset if provided, otherwise try to match by dates
  const presetLabel = selectedPreset
    ? DATE_PRESETS.find(p => p.key === selectedPreset)?.label || null
    : getPresetLabel(startDate, endDate);
  const displayLabel = presetLabel || `${formatDisplayDate(startDate)} - ${formatDisplayDate(endDate)}`;

  const handlePresetClick = useCallback((key: PresetKey, popId: string) => {
    const range = getDateRange(key);
    onDateChange(range.start, range.end, key);
    // Close the popover after selection
    const popover = document.getElementById(popId) as HTMLElement & { hide?: () => void };
    popover?.hide?.();
  }, [onDateChange]);

  const handleDatePickerChange = useCallback((e: Event) => {
    const target = e.target as HTMLInputElement;
    const value = target.value;
    // Range format: "YYYY-MM-DD--YYYY-MM-DD"
    if (value && value.includes("--")) {
      const [start, end] = value.split("--");
      onDateChange(start, end);
    }
  }, [onDateChange]);

  return (
    <>
      <s-button commandFor={popoverId} variant="secondary" icon="calendar">
        {displayLabel}
      </s-button>
      <s-popover id={popoverId}>
        <s-box padding="none">
          <s-grid gridTemplateColumns="170px 1fr" gap="none">
            <s-stack direction="block" gap="small-300" background="subdued" borderRadius="base">
              {/* Preset buttons */}
              <s-stack gap="small-300" padding="small">
                {DATE_PRESETS.map((preset) => (
                  <s-button
                    key={preset.key}
                    variant={selectedPreset === preset.key || (!selectedPreset && presetLabel === preset.label) ? "primary" : "tertiary"}
                    onClick={() => handlePresetClick(preset.key, popoverId)}
                  >
                    {preset.label}
                  </s-button>
                ))}
              </s-stack>
            </s-stack>
            <s-stack direction="block" gap="small-300" padding="base">
              <s-grid gridTemplateColumns="1fr 20px 1fr" alignItems="center" gap="small">
                <s-text-field
                  label=""
                  value={startDate}
                  onChange={(e: Event) => onDateChange((e.target as HTMLInputElement).value, endDate)}
                />
                <s-icon type="arrow-right" />
                <s-text-field
                  label=""
                  value={endDate}
                  onChange={(e: Event) => onDateChange(startDate, (e.target as HTMLInputElement).value)}
                />
              </s-grid>

              {/* Custom date range picker */}
              <s-date-picker
                type="range"
                name="date-range"
                value={`${startDate}--${endDate}`}
                view={startDate.slice(0, 7)}
                onChange={handleDatePickerChange}
              />
            </s-stack>
          </s-grid>
        </s-box>
      </s-popover>
    </>
  );
}
