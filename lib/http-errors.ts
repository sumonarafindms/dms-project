export function isDatabaseUnavailable(error:unknown){
 const text=error instanceof Error?`${error.name} ${error.message}`:String(error||"");
 return /can't reach database|connection.*(refused|closed|timeout)|server has closed the connection|P1001|P1002|P1017|ECONNREFUSED|ETIMEDOUT|ENETUNREACH/i.test(text);
}
export function apiError(error:unknown,fallback:string){
 if(isDatabaseUnavailable(error))return {status:503,error:"Database is temporarily unavailable. Please try again shortly."};
 return {status:500,error:fallback};
}
