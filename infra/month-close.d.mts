// Type surface for the month-close CLI shell (F-BILL slice-05).

export type MonthCloseOutput = Readonly<{ log: (line: string) => void }>;

export declare function runMonthClose(options?: Readonly<{
  argv?: readonly string[];
  output?: MonthCloseOutput;
}>): number;
