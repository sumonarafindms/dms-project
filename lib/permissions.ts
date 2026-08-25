import {prisma} from "./prisma";

export const permissionModules=[
 {key:"dashboard",label:"Dashboard",group:"Overview"},
 {key:"performance",label:"Performance",group:"Overview"},
 {key:"attention",label:"Attention Center",group:"Overview"},
 {key:"employees",label:"Employees",group:"People"},
 {key:"retailers",label:"Retailers",group:"People"},
 {key:"targets",label:"Targets / SC",group:"Operations"},
 {key:"ga",label:"GA",group:"Operations"},
 {key:"c2c",label:"C2C",group:"Operations"},
 {key:"c2s",label:"C2S",group:"Operations"},
 {key:"ob",label:"Opening Balance",group:"Operations"},
 {key:"bp",label:"BP / SIM Sales",group:"Operations"},
] as const;
export type PermissionModule=typeof permissionModules[number]["key"];
export type PermissionAction="view"|"add"|"edit"|"update";

export const roleDefaults:Record<string,Partial<Record<PermissionModule,{view:boolean;add:boolean;edit:boolean;update:boolean}>>>={
 MANAGER:{dashboard:{view:true,add:false,edit:false,update:false},performance:{view:true,add:false,edit:false,update:false},attention:{view:true,add:false,edit:false,update:false},employees:{view:true,add:false,edit:false,update:false},retailers:{view:true,add:false,edit:false,update:false},bp:{view:true,add:false,edit:false,update:false}},
 SUPERVISOR:{dashboard:{view:true,add:false,edit:false,update:false},performance:{view:true,add:false,edit:false,update:false},attention:{view:true,add:false,edit:false,update:false},employees:{view:true,add:false,edit:false,update:false},retailers:{view:true,add:false,edit:false,update:false},bp:{view:true,add:false,edit:false,update:false}},
 ACCOUNTS:{dashboard:{view:true,add:false,edit:false,update:false},attention:{view:true,add:false,edit:false,update:false},employees:{view:true,add:false,edit:false,update:false},retailers:{view:true,add:true,edit:true,update:true},targets:{view:true,add:true,edit:true,update:true},ga:{view:true,add:true,edit:true,update:true},c2c:{view:true,add:true,edit:true,update:true},c2s:{view:true,add:true,edit:true,update:true},ob:{view:true,add:true,edit:true,update:true},bp:{view:true,add:true,edit:true,update:true}},
 RSO:{dashboard:{view:true,add:false,edit:false,update:false},attention:{view:true,add:false,edit:false,update:false},retailers:{view:true,add:false,edit:false,update:false},bp:{view:true,add:false,edit:false,update:false}},
 BP:{dashboard:{view:true,add:false,edit:false,update:false},ga:{view:true,add:false,edit:false,update:false},bp:{view:true,add:false,edit:false,update:false}},
};


const none={view:false,add:false,edit:false,update:false};
const view={view:true,add:false,edit:false,update:false};
const manage={view:true,add:true,edit:true,update:true};

export const permissionPresets={
  ROLE_DEFAULT:"ROLE_DEFAULT",
  VIEW_ONLY:"VIEW_ONLY",
  DATA_OPERATOR:"DATA_OPERATOR",
  FULL_NON_ADMIN:"FULL_NON_ADMIN",
} as const;

export function presetPermissions(role:string,preset:string){
  if(preset==="ROLE_DEFAULT"){
    return permissionModules.map(m=>({module:m.key,...(roleDefaults[role]?.[m.key]||none)}));
  }
  if(preset==="VIEW_ONLY"){
    return permissionModules.map(m=>({module:m.key,...(roleDefaults[role]?.[m.key]?.view?view:none)}));
  }
  if(preset==="DATA_OPERATOR"){
    const writable=new Set<PermissionModule>(["retailers","targets","ga","c2c","c2s","ob","bp"]);
    return permissionModules.map(m=>{
      const allowed=Boolean(roleDefaults[role]?.[m.key]?.view);
      return {module:m.key,...(!allowed?none:writable.has(m.key)?manage:view)};
    });
  }
  if(preset==="FULL_NON_ADMIN"){
    return permissionModules.map(m=>({module:m.key,...(roleDefaults[role]?.[m.key]?.view?manage:none)}));
  }
  return permissionModules.map(m=>({module:m.key,...none}));
}

export async function permissionsFor(userId:string,role:string){
 if(role==="ADMIN")return Object.fromEntries(permissionModules.map(m=>[m.key,{view:true,add:true,edit:true,update:true}]));
 const custom=await prisma.userPermission.findMany({where:{userId}});
 const result:any={};
 for(const m of permissionModules){
  const d=roleDefaults[role]?.[m.key]||{view:false,add:false,edit:false,update:false};
  result[m.key]={...d};
 }
 for(const p of custom)result[p.module]={view:p.canView,add:p.canAdd,edit:p.canEdit,update:p.canUpdate};
 return result;
}
export async function hasPermission(userId:string,role:string,module:PermissionModule,action:PermissionAction="view"){
 if(role==="ADMIN")return true;
 const p=await prisma.userPermission.findUnique({where:{userId_module:{userId,module}}});
 if(p)return action==="view"?p.canView:action==="add"?p.canAdd:action==="edit"?p.canEdit:p.canUpdate;
 const d=roleDefaults[role]?.[module];return Boolean(d?.[action]);
}
