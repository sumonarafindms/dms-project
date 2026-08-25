export const SIM_SWAP_PRODUCT_CODES=["SIMWAP","EV-SWAP"] as const;

export function normalizeGaProductCode(value:string|null|undefined){
  return (value||"").trim().toUpperCase();
}

export function isSimSwapProduct(value:string|null|undefined){
  const code=normalizeGaProductCode(value);
  return code==="SIMWAP"||code==="EV-SWAP";
}

export function isGa300Product(value:string|null|undefined){
  const code=normalizeGaProductCode(value);
  return code==="MMSTS"||code==="MMST";
}

export function isGa170Product(value:string|null|undefined){
  return normalizeGaProductCode(value)==="MMSTC";
}

export const SIM_SWAP_SELLING_PRICE=350;

export function hasExpectedSimSwapPrice(productCode:string|null|undefined,sellingPrice:number){
  return !isSimSwapProduct(productCode)||sellingPrice===SIM_SWAP_SELLING_PRICE;
}
