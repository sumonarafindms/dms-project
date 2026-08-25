export function parseYmd(value?:string|null){
 if(!value||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
 const d=new Date(`${value}T00:00:00.000Z`);return Number.isNaN(d.getTime())?null:d;
}
export function addDays(date:Date,days:number){return new Date(date.getTime()+days*86400000)}
export function monthStartUtc(date:Date){return new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),1))}
export function nextMonthUtc(date:Date){return new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1))}
export function monthStartsInRange(start:Date,endExclusive:Date){
 const result:Date[]=[];let m=monthStartUtc(start);
 while(m<endExclusive){result.push(m);m=nextMonthUtc(m)}
 return result;
}
export function fullyCoveredMonths(start:Date,endExclusive:Date){
 return monthStartsInRange(start,endExclusive).filter(m=>start<=m&&endExclusive>=nextMonthUtc(m));
}
