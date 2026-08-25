"use client";
import {createContext,useContext} from "react";

export type ClientPermission={view:boolean;add:boolean;edit:boolean;update:boolean};
export type ClientPermissionMap=Record<string,ClientPermission>;
const PermissionContext=createContext<ClientPermissionMap>({});

export function PermissionProvider({permissions,children}:{permissions:ClientPermissionMap;children:React.ReactNode}){
 return <PermissionContext.Provider value={permissions}>{children}</PermissionContext.Provider>
}
export function usePermissions(){return useContext(PermissionContext)}
export function useCan(module:string,action:keyof ClientPermission="view"){
 const permissions=usePermissions();return Boolean(permissions[module]?.[action]);
}
export function PermissionGate({module,action="view",children}:{module:string;action?:keyof ClientPermission;children:React.ReactNode}){
 return useCan(module,action)?<>{children}</>:null;
}
