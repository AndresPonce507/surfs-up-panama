export type MonthCloseOutput = Readonly<{ log(line: string): void }>;

export declare function runMonthClose(input?: Readonly<{
  argv?: readonly string[];
  output?: MonthCloseOutput;
}>): number;
