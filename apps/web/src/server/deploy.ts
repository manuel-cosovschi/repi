// Modo de despliegue (D68). "demo": entorno hospedado sólo con datos DEMO (is_demo) y sin proveedor de email (D24):
// los correos quedan en el buzón DEV, visible únicamente para REPI Admin. Nunca usar este modo con clientes reales.
export const isDemoDeploy = () => process.env.REPI_DEPLOY === "demo";
