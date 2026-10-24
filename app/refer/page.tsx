import { ReferralSignup } from "@/components/referral-signup";
export const metadata={title:"Refer & earn $3 | Second Look",robots:{index:false,follow:false}};
export default function ReferPage() {
  return <main id="main" className="wrap" style={{maxWidth:900,paddingTop:64,paddingBottom:80}}>
    <p className="micro">ANYONE CAN REFER</p>
    <h1 style={{fontSize:"clamp(38px, 7vw, 64px)",lineHeight:1.08,margin:"16px 0"}}>Share the link.<br/>Get $3.</h1>
    <p className="editorial-intro" style={{marginBottom:32}}>Know someone who wants a better dating profile? Send them your link. They pay the usual $15 or $40, and you earn $3 on their first qualifying purchase.</p>
    <ReferralSignup/>
    <div className="plain-steps" style={{marginTop:40,gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))"}}>
      <article><span className="step-index">1.</span><h3>Connect Whop.</h3><p>Anyone with a Whop account can join. You don’t need to have your own profile reviewed.</p></article>
      <article><span className="step-index">2.</span><h3>Share your link.</h3><p>Send it to a friend before they create their order. You can use it yourself on your first purchase, too.</p></article>
      <article><span className="step-index">3.</span><h3>Collect $3.</h3><p>After screening and a 30-day hold, we send the reward to your Whop balance. Refunded or disputed orders don’t qualify.</p></article>
    </div>
  </main>;
}
