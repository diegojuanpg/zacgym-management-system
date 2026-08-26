-- Arreglo puntual del fantasma que dejo el bug de borrar_venta.
--
-- El turno del 26/8 19:46 abrio contando 54 aguas y el sistema esperaba 55. Los
-- 55 no existieron nunca: salieron de una venta vieja borrada, que devolvio al
-- stock una botella que ya se habia vendido y que el cierre anterior ya habia
-- contado afuera. La heladera tenia 54.
--
-- Se corrige el `esperado`, no el `contado`: lo que estuvo mal fue lo que el
-- sistema creia, no lo que la persona conto. Poner 55 en el contado seria
-- anotar que habia 55 botellas.
--
-- Con guarda por si ya lo arreglaron a mano: solo toca la fila si sigue en el
-- estado exacto que dejo el bug.
update public.turno_stock ts
   set esperado = ts.contado
  from public.turnos t, public.productos p
 where ts.turno_id = t.id
   and ts.producto_id = p.id
   and ts.momento = 'apertura'
   and p.nombre = 'Agua 600ml'
   and t.abierto_en >= '2026-08-26T22:00:00Z'
   and t.abierto_en < '2026-08-26T23:00:00Z'
   and ts.contado = 54
   and ts.esperado = 55;
