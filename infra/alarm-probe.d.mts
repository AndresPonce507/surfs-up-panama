export type AlarmProbeOutput = Readonly<{ log(line: string): void }>;

export declare function runAlarmProbe(input?: Readonly<{
  argv?: readonly string[];
  output?: AlarmProbeOutput;
  watchList?: readonly string[];
}>): number;
