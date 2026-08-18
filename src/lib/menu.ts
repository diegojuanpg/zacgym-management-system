/**
 * Preferencia del menú lateral. Va en cookie y no en localStorage para que el
 * server ya sepa cómo arrancar: si no, el menú aparecería fijo y saltaría al
 * plegarse. Vive acá y no en el componente porque un archivo "use client"
 * exporta referencias, no valores, cuando lo importa el server.
 */
export const COOKIE_MENU = "zacgym-menu";
