import {prisma} from "./prisma";
import {monthBounds} from "./month";

export function normalizeMonth(value?:string){
 const v=(value||new Date().toISOString().slice(0,7)).slice(0,7);
 return /^\d{4}-\d{2}$/.test(v)?v:new Date().toISOString().slice(0,7);
}
export async function retailerMonthDetail(retailerId:string,month:string){
 const {start,end}=monthBounds(`${normalizeMonth(month)}-01`);
 const [retailer,ga,c2c,c2s,ob,bp]=await Promise.all([
  prisma.retailer.findUnique({where:{id:retailerId},include:{employee:{include:{supervisor:true}}}}),
  prisma.gaActivation.findMany({where:{retailerId,activationDate:{gte:start,lt:end}},orderBy:[{activationDate:"desc"},{activationTime:"desc"}],select:{simNo:true,sellingPrice:true,activationDate:true,activationTime:true}}),
  prisma.c2cRecord.findMany({where:{retailerId,date:{gte:start,lt:end}},orderBy:{date:"desc"},select:{date:true,amount:true,transactionCount:true}}),
  prisma.c2sRecord.findMany({where:{retailerId,date:{gte:start,lt:end}},orderBy:{date:"desc"},select:{date:true,amount:true,transactionCount:true}}),
  prisma.obRecord.findFirst({where:{retailerId},orderBy:{date:"desc"},select:{date:true,amount:true}}),
  prisma.bpAssignment.findFirst({where:{retailerId,active:true},select:{gaTarget:true,startDate:true,employee:{select:{name:true}}}}),
 ]);
 if(!retailer)return null;
 const ga150=ga.filter(x=>Number(x.sellingPrice)===170).length,ga300=ga.length-ga150;
 const c2cAmount=c2c.reduce((a,x)=>a+Number(x.amount),0),c2cTrx=c2c.reduce((a,x)=>a+x.transactionCount,0);
 const c2sAmount=c2s.reduce((a,x)=>a+Number(x.amount),0),c2sTrx=c2s.reduce((a,x)=>a+x.transactionCount,0);
 const simSeller=(retailer.simSeller||"").trim().toUpperCase()==="Y";
 return {retailer,ga,ga150,ga300,c2c,c2cAmount,c2cTrx,c2s,c2sAmount,c2sTrx,ob,bp,ssoComplete:simSeller&&ga.length>=2,lsoComplete:c2sAmount>=500&&c2sTrx>=7};
}
