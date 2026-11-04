// D188: script de arranque del tema (va en <head>, antes de pintar). Sin dependencias ni React: lee la copia local y el
// modo del dispositivo y fija data-theme en <html>. Mismo cálculo que applyTheme (lib/theme.ts). Sin copia local o sin
// JavaScript, el CSS sigue a prefers-color-scheme (Automático), así que tampoco hay destello.
export const THEME_KEY = "repi:theme";
export const DARK_MQ = "(prefers-color-scheme: dark)";
export const THEME_BOOT = `(function(){try{var d=document.documentElement,p="system";try{var v=JSON.parse(localStorage.getItem(${JSON.stringify(THEME_KEY)})||"null");if(v&&(v.pref==="light"||v.pref==="dark"||v.pref==="system"))p=v.pref}catch(e){}var t=p==="system"?(window.matchMedia&&matchMedia(${JSON.stringify(DARK_MQ)}).matches?"dark":"light"):p;d.setAttribute("data-theme",t);d.setAttribute("data-theme-pref",p)}catch(e){}})()`;
