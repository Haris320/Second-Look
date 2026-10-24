import { referralSession } from "@/lib/referral-auth";
import { sameOrigin, privateHeaders } from "@/lib/order-access";
export async function POST(request:Request) {
  if (!sameOrigin(request)) return new Response("Access denied",{status:403,headers:privateHeaders});
  (await referralSession()).destroy();
  return new Response(null,{status:303,headers:{...privateHeaders,Location:new URL("/refer",process.env.PUBLIC_BASE_URL!).href}});
}
