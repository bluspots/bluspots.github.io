// Brand + semantic colors — constant across light/dark themes (see App() for
// the theme-dependent surface/text/border tokens: BG, W, TX, TS, TM, BD, SL).
const N='#1C2B3A',AM='#F59E0B';
const SC='#059669';

const PersonIcon=({col=AM,sz=22})=>(
  <svg width={sz} height={sz} viewBox="0 0 24 24" fill={col} style={{display:"block"}}>
    <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
  </svg>
);

// Shared avatar component — the single source of truth for how the user's
// own profile photo renders, everywhere it appears (Home header, Profile
// account card, Edit Profile picker). Two layers of circular clipping on
// purpose: the container (fixed size, border-radius:50%, overflow:hidden)
// AND the image itself (also border-radius:50%) — a container clip alone
// can still let square image edges show through in some browsers during a
// transform or mid-load, so the image clips itself too as a second layer.
const Avatar=({photo,size,iconSize,iconColor,bg=AM,onClick,children})=>(
  <div onClick={onClick} style={{width:size,height:size,borderRadius:"50%",overflow:"hidden",background:bg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,position:"relative",cursor:onClick?"pointer":undefined}}>
    {photo?(
      <img src={photo} alt="" style={{width:"100%",height:"100%",objectFit:"cover",objectPosition:"center",display:"block",borderRadius:"50%"}}/>
    ):(
      <PersonIcon col={iconColor} sz={iconSize}/>
    )}
    {children}
  </div>
);

const CSS=`
.sc::-webkit-scrollbar{display:none}
.sc{-ms-overflow-style:none;scrollbar-width:none}
*{box-sizing:border-box}
button,input,textarea{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
/* iOS Safari zooms the viewport on focus when a form control's computed
   font-size is below 16px. Force a mobile-safe minimum everywhere rather
   than special-casing individual fields — this is the standard fix and
   deliberately does NOT touch user-scalable/maximum-scale, which would
   disable the person's own pinch-zoom accessibility instead of fixing the
   underlying cause. */
input,textarea,select{font-size:16px!important;}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.93)}}
@keyframes bounce{0%{transform:translateY(0)}100%{transform:translateY(-5px)}}
/* On an actual phone (or installed PWA) the app fills the real screen —
   the centered "phone frame" mockup below is a desktop-preview convenience
   only, and would otherwise float as a small fixed-size box on a real
   device instead of using the real screen. */
@media (max-width:480px){
  .haven-frame-outer{padding:0!important;background:#F5F2ED!important;align-items:stretch!important;}
  .haven-frame-phone{width:100%!important;height:100dvh!important;border-radius:0!important;box-shadow:none!important;}
}
/* Print isolation: hide everything except the receipt itself — no app
   chrome, no bottom nav, no header buttons, no phone-frame styling. */
@media print{
  body *{visibility:hidden!important;}
  .receipt-print-area,.receipt-print-area *{visibility:visible!important;}
  .receipt-print-area{position:absolute!important;top:0!important;left:0!important;width:100%!important;background:#FFFFFF!important;box-shadow:none!important;}
  .no-print{display:none!important;}
}
`;
