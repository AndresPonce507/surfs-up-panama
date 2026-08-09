// Type surface for the month-close pure core (F-BILL slice-05).

export type CostAndUsageRead = Readonly<{
  ResultsByTime?: readonly Readonly<{
    TimePeriod?: Readonly<{ Start?: string; End?: string }>;
    Groups?: readonly Readonly<{
      Keys?: readonly string[];
      Metrics?: Readonly<{ UnblendedCost?: Readonly<{ Amount?: string; Unit?: string }> }>;
    }>[];
  }>[];
}>;

export type MonthCloseReads = Readonly<{
  costByService: CostAndUsageRead;
  costAllocationTags: Readonly<{
    CostAllocationTags?: readonly Readonly<{ TagKey?: string; Type?: string; Status?: string }>[];
  }>;
  projectCostByService: CostAndUsageRead | null;
  freeTierUsage: Readonly<{
    freeTierUsages?: readonly Readonly<{
      service?: string;
      description?: string;
      actualUsageAmount?: number;
      limit?: number;
      unit?: string;
      freeTierType?: string;
    }>[];
  }>;
}>;

export declare const projectTag: Readonly<{ key: string; value: string }>;

export declare function evaluateMonthClose(input: Readonly<{ reads: MonthCloseReads }>): Readonly<{
  exitCode: number;
  lines: readonly string[];
}>;
