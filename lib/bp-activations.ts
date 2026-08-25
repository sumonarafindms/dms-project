import {prisma} from "./prisma";
import {monthBounds} from "./month";
import {normalizeMonth} from "./drilldown";

export type BpViewer={role:string;employeeId?:string|null;supervisorId?:string|null;bpRetailerId?:string|null};

export function assignmentAccessWhere(user:BpViewer){
  if(user.role==="MANAGER"||user.role==="ADMIN") return {};
  if(user.role==="SUPERVISOR") return {employee:{supervisorId:user.supervisorId||"__none__"}};
  if(user.role==="RSO") return {employeeId:user.employeeId||"__none__"};
  if(user.role==="BP") return {retailerId:user.bpRetailerId||"__none__",active:true};
  return {id:"__none__"};
}

export async function listBpAssignments(user:BpViewer,monthInput?:string,qInput?:string){
  const month=normalizeMonth(monthInput),q=(qInput||"").trim(),{start,end}=monthBounds(`${month}-01`);
  const access=assignmentAccessWhere(user);
  const assignments=await prisma.bpAssignment.findMany({
    where:{...access,AND:[
      {startDate:{lt:end}},
      {OR:[{endDate:null},{endDate:{gte:start}}]},
      ...(q?[{OR:[
        {retailer:{retailerCode:{contains:q,mode:"insensitive"}}},
        {retailer:{retailerName:{contains:q,mode:"insensitive"}}},
        {employee:{name:{contains:q,mode:"insensitive"}}},
        {employee:{employeeCode:{contains:q,mode:"insensitive"}}},
      ]}]:[])
    ]},
    include:{retailer:{select:{retailerCode:true,retailerName:true}},employee:{select:{name:true,employeeCode:true,supervisor:{select:{name:true}}}}},
    orderBy:[{active:"desc"},{startDate:"desc"}],
    take:500,
  });
  const withCounts=await Promise.all(assignments.map(async a=>{
    const effectiveStart=a.startDate>start?a.startDate:start;
    const assignmentEnd=a.endDate?new Date(a.endDate.getTime()+86400000):end;
    const effectiveEnd=assignmentEnd<end?assignmentEnd:end;
    const monthGa=effectiveStart<effectiveEnd?await prisma.gaActivation.count({where:{retailerId:a.retailerId,activationDate:{gte:effectiveStart,lt:effectiveEnd}}}):0;
    return {...a,monthGa};
  }));
  return {month,assignments:withCounts};
}

export async function bpAssignmentDetail(user:BpViewer,id:string,monthInput?:string,qInput?:string){
  const month=normalizeMonth(monthInput),q=(qInput||"").trim(),{start,end}=monthBounds(`${month}-01`);
  const assignment=await prisma.bpAssignment.findFirst({
    where:{id,...assignmentAccessWhere(user)},
    include:{retailer:{select:{id:true,retailerCode:true,retailerName:true,category:true,route:true}},employee:{select:{name:true,employeeCode:true,rsoMsisdn:true,supervisor:{select:{name:true}}}}}
  });
  if(!assignment)return null;
  const effectiveStart=assignment.startDate>start?assignment.startDate:start;
  const assignmentEnd=assignment.endDate?new Date(assignment.endDate.getTime()+86400000):end;
  const effectiveEnd=assignmentEnd<end?assignmentEnd:end;
  const where={retailerId:assignment.retailerId,activationDate:{gte:effectiveStart,lt:effectiveEnd},...(q?{simNo:{contains:q,mode:"insensitive" as const}}:{})};
  const [rows,total]=await Promise.all([
    prisma.gaActivation.findMany({where,orderBy:[{activationDate:"desc"},{activationTime:"desc"}],take:500,select:{simNo:true,sellingPrice:true,activationDate:true,activationTime:true}}),
    prisma.gaActivation.count({where}),
  ]);
  const total150=await prisma.gaActivation.count({where:{...where,sellingPrice:170}});
  const total300=total-total150;
  const dailyRaw=await prisma.gaActivation.groupBy({by:["activationDate"],where,_count:{_all:true},orderBy:{activationDate:"desc"}});
  return {month,q,assignment,total,total150,total300,rows,daily:dailyRaw.map(x=>({date:x.activationDate,count:x._count._all})),effectiveStart,effectiveEnd};
}
