export type ImportType = "GA" | "C2C" | "C2S" | "OB";

export type NormalizedGaRow = {
  retailerCode: string;
  date: Date;
  gaCount: number;
  ga150?: number;
  ga300?: number;
};

export type NormalizedMoneyRow = {
  retailerCode: string;
  date: Date;
  transactionCount: number;
  amount: number;
};

import { LSO_MIN_MONTHLY_AMOUNT, LSO_MIN_MONTHLY_TRANSACTIONS } from "./business-rules";

export const IMPORT_RULES = {
  GA: "Retailer-level GA is imported. Employee achievement is the monthly sum of standard GA (MMSTC + MMST/MMSTS) across all linked retailers. SIMWAP and EV-SWAP are replacements and are excluded.",
  C2C: "Retailer-level balance/recharge distribution is imported. Employee achievement is the monthly amount sum across linked retailers.",
  C2S: `Retailer-level C2S amount and transaction count are imported. Current LSO rule: amount >= ${LSO_MIN_MONTHLY_AMOUNT} and transactions >= ${LSO_MIN_MONTHLY_TRANSACTIONS} for the month.`,
  OB: "Imported and stored for the limited reports that require it.",
} as const;
