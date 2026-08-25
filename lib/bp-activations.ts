import {Prisma} from "@prisma/client";
import {prisma} from "./prisma";
import {monthBounds} from "./month";
import {normalizeMonth} from "./drilldown";
import {monthStartsInRange,monthStartUtc} from "./date-range";
import {SIM_SWAP_PRODUCT_CODES} from "./ga-product";

export type BpViewer={role:string;employeeId?:string|null;supervisorId?:string|null;bpRetailerId?:string|null;managerSupervisorIds?:string[]};

export type BpAssignmentListRow = {
  id: string;
  active: boolean;
  retailerId: string;
  employeeId: string;
  gaTarget: number;
  startDate: Date;
  endDate: Date | null;
  monthGa: number;
  retailer: {
    retailerCode: string;
    retailerName: string | null;
  };
  employee: {
    name: string;
    employeeCode: string | null;
    supervisor: { name: string } | null;
  };
};


export function assignmentAccessWhere(user:BpViewer): Prisma.BpAssignmentWhereInput{
  if(user.role==="ADMIN"||user.role==="IT") return {};
  if(user.role==="MANAGER") return {employee:{supervisorId:{in:user.managerSupervisorIds||[]}}};
  if(user.role==="SUPERVISOR") return {employee:{supervisorId:user.supervisorId||"__none__"}};
  if(user.role==="RSO") return {employeeId:user.employeeId||"__none__"};
  if(user.role==="BP") return {retailerId:user.bpRetailerId||"__none__",active:true};
  return {id:"__none__"};
}

export async function listBpAssignments(user:BpViewer,monthInput?:string,qInput?:string,fromInput?:string,toInput?:string): Promise<{month:string;assignments:BpAssignmentListRow[]}>{
  const month=normalizeMonth(monthInput),q=(qInput||"").trim(),{start,end}=monthBounds(`${month}-01`);
  const parse=(v?:string)=>v&&/^\d{4}-\d{2}-\d{2}$/.test(v)?new Date(`${v}T00:00:00.000Z`):null;
  const rangeStart=parse(fromInput)||start,to=parse(toInput),rangeEnd=to?new Date(to.getTime()+86400000):end;
  const access=assignmentAccessWhere(user);
  const assignments=await prisma.bpAssignment.findMany({
    where:{...access,AND:[
      {startDate:{lt:rangeEnd}},
      {OR:[{endDate:null},{endDate:{gte:rangeStart}}]},
      ...(q?[{OR:[
        {retailer:{retailerCode:{contains:q,mode:"insensitive" as const}}},
        {retailer:{retailerName:{contains:q,mode:"insensitive" as const}}},
        {employee:{name:{contains:q,mode:"insensitive" as const}}},
        {employee:{employeeCode:{contains:q,mode:"insensitive" as const}}},
      ]}]:[])
    ]},
    include:{retailer:{select:{retailerCode:true,retailerName:true}},employee:{select:{name:true,employeeCode:true,supervisor:{select:{name:true}}}},monthlyTargets:true},
    orderBy:[{active:"desc"},{startDate:"desc"}],
    take:500,
  });
  const withCounts: BpAssignmentListRow[] = await Promise.all(assignments.map(async a=>{
    const effectiveStart=a.startDate>rangeStart?a.startDate:rangeStart;
    const assignmentEnd=a.endDate?new Date(a.endDate.getTime()+86400000):rangeEnd;
    const effectiveEnd=assignmentEnd<rangeEnd?assignmentEnd:rangeEnd;
    const monthGa=effectiveStart<effectiveEnd?await prisma.gaActivation.count({where:{retailerId:a.retailerId,activationDate:{gte:effectiveStart,lt:effectiveEnd},productCode:{notIn:[...SIM_SWAP_PRODUCT_CODES]}}}):0;
    const targetMap=new Map(a.monthlyTargets.map(x=>[x.month.toISOString().slice(0,7),x.gaTarget]));
    const gaTarget=monthStartsInRange(effectiveStart,effectiveEnd).reduce((sum,m)=>sum+(targetMap.get(m.toISOString().slice(0,7))??a.gaTarget),0);
    return {
      id:a.id,
      active:a.active,
      retailerId:a.retailerId,
      employeeId:a.employeeId,
      gaTarget,
      startDate:a.startDate,
      endDate:a.endDate,
      monthGa,
      retailer:a.retailer,
      employee:a.employee,
    };
  }));
  return {month,assignments:withCounts};
}

export async function bpAssignmentDetail(user:BpViewer,id:string,monthInput?:string,qInput?:string,fromInput?:string,toInput?:string){
  const month=normalizeMonth(fromInput?.slice(0,7)||monthInput),q=(qInput||"").trim(),{start,end}=monthBounds(`${month}-01`);
  const parse=(v?:string)=>v&&/^\d{4}-\d{2}-\d{2}$/.test(v)?new Date(`${v}T00:00:00.000Z`):null;
  const rangeStart=parse(fromInput)||start,to=parse(toInput),rangeEnd=to?new Date(to.getTime()+86400000):end;
  const assignment=await prisma.bpAssignment.findFirst({
    where:{id,...assignmentAccessWhere(user)},
    include:{retailer:{select:{id:true,retailerCode:true,retailerName:true,category:true,route:true}},employee:{select:{name:true,employeeCode:true,rsoMsisdn:true,supervisor:{select:{name:true}}}},monthlyTargets:true}
  });
  if(!assignment)return null;
  const effectiveStart=assignment.startDate>rangeStart?assignment.startDate:rangeStart;
  const assignmentEnd=assignment.endDate?new Date(assignment.endDate.getTime()+86400000):rangeEnd;
  // Detail view respects the selected date range and the BP assignment boundary.
  const effectiveEnd=assignmentEnd<rangeEnd?assignmentEnd:rangeEnd;
  const targetMap=new Map(assignment.monthlyTargets.map(x=>[x.month.toISOString().slice(0,7),x.gaTarget]));
  const rangeTarget=effectiveStart<effectiveEnd?monthStartsInRange(effectiveStart,effectiveEnd).reduce((sum,m)=>sum+(targetMap.get(m.toISOString().slice(0,7))??assignment.gaTarget),0):0;
  const assignmentView={...assignment,gaTarget:rangeTarget};
  const commonWhere: Prisma.GaActivationWhereInput={retailerId:assignment.retailerId,activationDate:{gte:effectiveStart,lt:effectiveEnd},...(q?{simNo:{contains:q,mode:"insensitive"}}:{})};
  const where: Prisma.GaActivationWhereInput={...commonWhere,productCode:{notIn:[...SIM_SWAP_PRODUCT_CODES]}};
  const swapWhere: Prisma.GaActivationWhereInput={...commonWhere,productCode:{in:[...SIM_SWAP_PRODUCT_CODES]}};
  const [rows,total,simSwap]=await Promise.all([
    prisma.gaActivation.findMany({where,orderBy:[{activationDate:"desc"},{activationTime:"desc"}],take:500,select:{simNo:true,sellingPrice:true,productCode:true,activationDate:true,activationTime:true}}),
    prisma.gaActivation.count({where}),
    prisma.gaActivation.count({where:swapWhere}),
  ]);
  const total150=await prisma.gaActivation.count({where:{...where,sellingPrice:170}});
  const total300=total-total150;
  const dailyRaw=await prisma.gaActivation.groupBy({by:["activationDate"],where,_count:{_all:true},orderBy:{activationDate:"desc"}});
  return {month,q,assignment:assignmentView,total,total150,total300,simSwap,rows,daily:dailyRaw.map(x=>({date:x.activationDate,count:x._count._all})),effectiveStart,effectiveEnd};
}
