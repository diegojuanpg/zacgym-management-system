"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { registrarMovimiento, type Movimiento } from "@/lib/caja";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Note } from "@/components/ui/note";
import { DollarIcon } from "@/components/icons";

const pesos = (n: number) => `$${n.toLocaleString("es-AR")}`;

export function MovimientoModal() {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [tipo, setTipo] = React.useState<Movimiento["tipo"]>("egreso");
  const [caja, setCaja] = React.useState<Movimiento["caja"]>("grande");
  const [metodo, setMetodo] = React.useState<Movimiento["metodo"]>("efectivo");
  const [monto, setMonto] = React.useState("");
  const [motivo, setMotivo] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [guardando, setGuardando] = React.useState(false);

  const importe = Number(monto) || 0;

  function limpiar() {
    setMonto("");
    setMotivo("");
    setError(null);
  }

  async function guardar(event: React.FormEvent) {
    event.preventDefault();
    if (importe <= 0) {
      setError("Poné cuánta plata entró o salió.");
      return;
    }
    if (motivo.trim() === "") {
      setError("Escribí para qué fue.");
      return;
    }

    setGuardando(true);
    setError(null);
    const { error } = await registrarMovimiento({
      tipo,
      monto: importe,
      motivo: motivo.trim(),
      caja,
      metodo,
    });
    setGuardando(false);
    if (error) {
      setError(error);
      return;
    }
    limpiar();
    setAbierto(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setAbierto(true)} prefix={<DollarIcon />}>
        Movimiento de caja
      </Button>

      <Modal
        open={abierto}
        onOpenChange={(abrir) => {
          if (!abrir) limpiar();
          setAbierto(abrir);
        }}
        title="Movimiento de caja"
        description="Plata que entra o sale sin ser una venta."
        className="w-[min(34rem,94vw)]"
        sticky
        footer={
          <div className="flex w-full items-center justify-between gap-4">
            <span className="text-copy-14 text-muted-foreground">
              {importe > 0 && (
                <>
                  {tipo === "ingreso" ? "Entran" : "Salen"}{" "}
                  <strong className="text-foreground tabular-nums">{pesos(importe)}</strong>
                </>
              )}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setAbierto(false)}>
                Cancelar
              </Button>
              <Button form="form-movimiento" type="submit" loading={guardando}>
                Registrar
              </Button>
            </div>
          </div>
        }
      >
        <form id="form-movimiento" onSubmit={guardar} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-4">
            <div>
              <Label htmlFor="tipo">Movimiento</Label>
              <Select
                id="tipo"
                size="large"
                value={tipo}
                onChange={(e) => setTipo(e.target.value as Movimiento["tipo"])}
              >
                <option value="egreso">Sale plata</option>
                <option value="ingreso">Entra plata</option>
              </Select>
            </div>

            <div>
              <Label htmlFor="caja">Caja</Label>
              <Select
                id="caja"
                size="large"
                value={caja}
                onChange={(e) => setCaja(e.target.value as Movimiento["caja"])}
              >
                <option value="grande">Grande</option>
                <option value="chica">Chica</option>
              </Select>
            </div>

            <div>
              <Label htmlFor="metodo-mov">Método</Label>
              <Select
                id="metodo-mov"
                size="large"
                value={metodo}
                onChange={(e) => setMetodo(e.target.value as Movimiento["metodo"])}
              >
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
              </Select>
            </div>

            <Input
              label="Monto"
              size="large"
              inputMode="numeric"
              prefix="$"
              placeholder="0"
              value={monto}
              onChange={(e) => setMonto(e.target.value.replace(/\D/g, ""))}
            />
          </div>

          <Input
            label="Para qué"
            size="large"
            placeholder="Comida del turno, reponer caja chica, pago a proveedor..."
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />

          {error && (
            <Note type="error" fill>
              {error}
            </Note>
          )}
        </form>
      </Modal>
    </>
  );
}
