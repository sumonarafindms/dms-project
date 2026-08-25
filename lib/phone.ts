export function phoneDigits(value:unknown){return String(value??"").replace(/\D/g,"")}
export function phoneKey(value:unknown){
 let d=phoneDigits(value);
 if(d.startsWith("88")&&d.length>=13)d=d.slice(2);
 d=d.replace(/^0+/,"");
 return d;
}
