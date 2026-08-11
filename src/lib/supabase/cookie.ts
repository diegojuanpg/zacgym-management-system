// El browser comparte cookies entre puertos del mismo host: con el nombre por defecto
// (sb-127-auth-token) la sesion de otro proyecto Supabase local pisa la de esta app y la
// tira abajo. Nombre propio = las dos sesiones conviven en localhost.
export const COOKIE_NAME = "sb-zacgym-auth-token";
