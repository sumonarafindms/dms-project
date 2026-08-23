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

export const IMPORT_RULES = {
  GA: "Retailer-level GA is imported. Employee achievement is the monthly sum of GA across all linked retailers.",
  C2C: "Retailer-level balance/recharge distribution is imported. Employee achievement is the monthly amount sum across linked retailers.",
  C2S: "Retailer-level C2S amount and transaction count are imported. Current LSO rule: amount >= 500 and transactions >= 7 for the month.",
  OB: "Imported and stored for the limited reports that require it.",
} as const;
