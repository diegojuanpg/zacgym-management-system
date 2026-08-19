export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      alumnos: {
        Row: {
          activo: boolean
          apellido: string
          celular: string | null
          creado_en: string
          email: string | null
          genero: Database["public"]["Enums"]["genero"] | null
          id: string
          nacimiento: string | null
          nombre: string
          nombre_completo: string | null
          sheet_id: string | null
          tracking_id: string | null
          vence: string | null
        }
        Insert: {
          activo?: boolean
          apellido: string
          celular?: string | null
          creado_en?: string
          email?: string | null
          genero?: Database["public"]["Enums"]["genero"] | null
          id?: string
          nacimiento?: string | null
          nombre: string
          nombre_completo?: string | null
          sheet_id?: string | null
          tracking_id?: string | null
          vence?: string | null
        }
        Update: {
          activo?: boolean
          apellido?: string
          celular?: string | null
          creado_en?: string
          email?: string | null
          genero?: Database["public"]["Enums"]["genero"] | null
          id?: string
          nacimiento?: string | null
          nombre?: string
          nombre_completo?: string | null
          sheet_id?: string | null
          tracking_id?: string | null
          vence?: string | null
        }
        Relationships: []
      }
      alumnos_tracking: {
        Row: {
          activo: boolean
          dias_entrenamiento: number | null
          estado: string | null
          gmail: string | null
          id: string
          nombre: string | null
          numero: string | null
          sheet_id: string | null
          ultima_rutina_semana: string | null
          ultimo_checkin: string | null
          updated_at: string
          vencimiento: string | null
        }
        Insert: {
          activo?: boolean
          dias_entrenamiento?: number | null
          estado?: string | null
          gmail?: string | null
          id: string
          nombre?: string | null
          numero?: string | null
          sheet_id?: string | null
          ultima_rutina_semana?: string | null
          ultimo_checkin?: string | null
          updated_at?: string
          vencimiento?: string | null
        }
        Update: {
          activo?: boolean
          dias_entrenamiento?: number | null
          estado?: string | null
          gmail?: string | null
          id?: string
          nombre?: string | null
          numero?: string | null
          sheet_id?: string | null
          ultima_rutina_semana?: string | null
          ultimo_checkin?: string | null
          updated_at?: string
          vencimiento?: string | null
        }
        Relationships: []
      }
      asistencias: {
        Row: {
          creado_en: string
          creado_por: string | null
          empleado_id: string
          entro: string
          id: string
          salio: string | null
        }
        Insert: {
          creado_en?: string
          creado_por?: string | null
          empleado_id: string
          entro?: string
          id?: string
          salio?: string | null
        }
        Update: {
          creado_en?: string
          creado_por?: string | null
          empleado_id?: string
          entro?: string
          id?: string
          salio?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asistencias_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
        ]
      }
      empleados: {
        Row: {
          activo: boolean
          creado_en: string
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          creado_en?: string
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          creado_en?: string
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      movimientos_caja: {
        Row: {
          anulado_en: string | null
          anulado_por: string | null
          caja: Database["public"]["Enums"]["caja"]
          creado_en: string
          creado_por: string
          id: string
          metodo: Database["public"]["Enums"]["metodo_pago"]
          monto: number
          motivo: string
          tipo: Database["public"]["Enums"]["movimiento_tipo"]
          turno_id: string | null
        }
        Insert: {
          anulado_en?: string | null
          anulado_por?: string | null
          caja?: Database["public"]["Enums"]["caja"]
          creado_en?: string
          creado_por: string
          id?: string
          metodo?: Database["public"]["Enums"]["metodo_pago"]
          monto: number
          motivo: string
          tipo: Database["public"]["Enums"]["movimiento_tipo"]
          turno_id?: string | null
        }
        Update: {
          anulado_en?: string | null
          anulado_por?: string | null
          caja?: Database["public"]["Enums"]["caja"]
          creado_en?: string
          creado_por?: string
          id?: string
          metodo?: Database["public"]["Enums"]["metodo_pago"]
          monto?: number
          motivo?: string
          tipo?: Database["public"]["Enums"]["movimiento_tipo"]
          turno_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_caja_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turno_actual"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_caja_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_caja_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos_cerrados"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos: {
        Row: {
          creado_en: string
          creado_por: string
          id: string
          metodo: Database["public"]["Enums"]["metodo_pago"]
          monto: number
          turno_id: string | null
          venta_id: string
        }
        Insert: {
          creado_en?: string
          creado_por: string
          id?: string
          metodo: Database["public"]["Enums"]["metodo_pago"]
          monto: number
          turno_id?: string | null
          venta_id: string
        }
        Update: {
          creado_en?: string
          creado_por?: string
          id?: string
          metodo?: Database["public"]["Enums"]["metodo_pago"]
          monto?: number
          turno_id?: string | null
          venta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pagos_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turno_actual"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos_cerrados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas_saldo"
            referencedColumns: ["id"]
          },
        ]
      }
      productos: {
        Row: {
          activo: boolean
          caja: Database["public"]["Enums"]["caja"] | null
          categoria: Database["public"]["Enums"]["categoria_producto"] | null
          contar_en_turno: boolean
          creado_en: string
          id: string
          nombre: string
          precio: number
          stock: number | null
        }
        Insert: {
          activo?: boolean
          caja?: Database["public"]["Enums"]["caja"] | null
          categoria?: Database["public"]["Enums"]["categoria_producto"] | null
          contar_en_turno?: boolean
          creado_en?: string
          id?: string
          nombre: string
          precio: number
          stock?: number | null
        }
        Update: {
          activo?: boolean
          caja?: Database["public"]["Enums"]["caja"] | null
          categoria?: Database["public"]["Enums"]["categoria_producto"] | null
          contar_en_turno?: boolean
          creado_en?: string
          id?: string
          nombre?: string
          precio?: number
          stock?: number | null
        }
        Relationships: []
      }
      promo_integrantes: {
        Row: {
          alumno_id: string
          promo_id: string
        }
        Insert: {
          alumno_id: string
          promo_id: string
        }
        Update: {
          alumno_id?: string
          promo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_integrantes_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: true
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_integrantes_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: true
            referencedRelation: "alumnos_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_integrantes_promo_id_fkey"
            columns: ["promo_id"]
            isOneToOne: false
            referencedRelation: "alumno_promo"
            referencedColumns: ["promo_id"]
          },
          {
            foreignKeyName: "promo_integrantes_promo_id_fkey"
            columns: ["promo_id"]
            isOneToOne: false
            referencedRelation: "promos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_integrantes_promo_id_fkey"
            columns: ["promo_id"]
            isOneToOne: false
            referencedRelation: "promos_detalle"
            referencedColumns: ["id"]
          },
        ]
      }
      promos: {
        Row: {
          activa: boolean
          creado_en: string
          id: string
          nombre: string
          producto_id: string
        }
        Insert: {
          activa?: boolean
          creado_en?: string
          id?: string
          nombre: string
          producto_id: string
        }
        Update: {
          activa?: boolean
          creado_en?: string
          id?: string
          nombre?: string
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promos_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      tarea_categorias: {
        Row: {
          creado_en: string
          id: string
          nombre: string
        }
        Insert: {
          creado_en?: string
          id?: string
          nombre: string
        }
        Update: {
          creado_en?: string
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      tareas: {
        Row: {
          alumno_id: string
          categoria_id: string | null
          creado_en: string
          creado_por: string
          detalle: string
          estado: Database["public"]["Enums"]["tarea_estado"]
          id: string
        }
        Insert: {
          alumno_id: string
          categoria_id?: string | null
          creado_en?: string
          creado_por: string
          detalle: string
          estado?: Database["public"]["Enums"]["tarea_estado"]
          id?: string
        }
        Update: {
          alumno_id?: string
          categoria_id?: string | null
          creado_en?: string
          creado_por?: string
          detalle?: string
          estado?: Database["public"]["Enums"]["tarea_estado"]
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tareas_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "tarea_categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      turno_stock: {
        Row: {
          contado: number
          esperado: number
          momento: string
          producto_id: string
          turno_id: string
        }
        Insert: {
          contado: number
          esperado: number
          momento: string
          producto_id: string
          turno_id: string
        }
        Update: {
          contado?: number
          esperado?: number
          momento?: string
          producto_id?: string
          turno_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "turno_stock_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turno_stock_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turno_actual"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turno_stock_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turno_stock_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos_cerrados"
            referencedColumns: ["id"]
          },
        ]
      }
      turnos: {
        Row: {
          abierto_en: string
          abierto_por: string
          caja_chica_esperada: number | null
          caja_chica_final: number | null
          caja_chica_inicial: number
          caja_grande_esperada: number | null
          caja_grande_final: number | null
          caja_grande_inicial: number
          cerrado_en: string | null
          cerrado_por: string | null
          id: string
          nota_cierre: string | null
        }
        Insert: {
          abierto_en?: string
          abierto_por: string
          caja_chica_esperada?: number | null
          caja_chica_final?: number | null
          caja_chica_inicial: number
          caja_grande_esperada?: number | null
          caja_grande_final?: number | null
          caja_grande_inicial: number
          cerrado_en?: string | null
          cerrado_por?: string | null
          id?: string
          nota_cierre?: string | null
        }
        Update: {
          abierto_en?: string
          abierto_por?: string
          caja_chica_esperada?: number | null
          caja_chica_final?: number | null
          caja_chica_inicial?: number
          caja_grande_esperada?: number | null
          caja_grande_final?: number | null
          caja_grande_inicial?: number
          cerrado_en?: string | null
          cerrado_por?: string | null
          id?: string
          nota_cierre?: string | null
        }
        Relationships: []
      }
      ventas: {
        Row: {
          alumno_id: string
          anulada_en: string | null
          anulada_por: string | null
          cantidad: number
          creado_en: string
          creado_por: string
          id: string
          precio_unitario: number
          producto_id: string
          total: number | null
          turno_id: string | null
        }
        Insert: {
          alumno_id: string
          anulada_en?: string | null
          anulada_por?: string | null
          cantidad?: number
          creado_en?: string
          creado_por: string
          id?: string
          precio_unitario: number
          producto_id: string
          total?: number | null
          turno_id?: string | null
        }
        Update: {
          alumno_id?: string
          anulada_en?: string | null
          anulada_por?: string | null
          cantidad?: number
          creado_en?: string
          creado_por?: string
          id?: string
          precio_unitario?: number
          producto_id?: string
          total?: number | null
          turno_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ventas_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turno_actual"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos_cerrados"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      alumno_promo: {
        Row: {
          alumno_id: string | null
          precio: number | null
          producto: string | null
          producto_id: string | null
          promo: string | null
          promo_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_integrantes_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: true
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_integrantes_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: true
            referencedRelation: "alumnos_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promos_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      alumnos_cuenta: {
        Row: {
          a_favor: number | null
          activo: boolean | null
          apellido: string | null
          celular: string | null
          comprado: number | null
          creado_en: string | null
          debe: number | null
          dias_entrenamiento: number | null
          edad: number | null
          email: string | null
          estado_membresia: string | null
          genero: Database["public"]["Enums"]["genero"] | null
          id: string | null
          nacimiento: string | null
          nombre: string | null
          nombre_completo: string | null
          pagado: number | null
          saldo: number | null
          sheet_id: string | null
          tracking_id: string | null
          ultima_actividad: string | null
          ultimo_checkin: string | null
          vence: string | null
        }
        Relationships: []
      }
      asistencias_detalle: {
        Row: {
          creado_en: string | null
          empleado_id: string | null
          entro: string | null
          id: string | null
          nombre: string | null
          salio: string | null
          trabajando: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "asistencias_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
        ]
      }
      dias_con_ventas: {
        Row: {
          dia: string | null
        }
        Relationships: []
      }
      diferencias_stock: {
        Row: {
          abierto_en: string | null
          cerrado_en: string | null
          contado: number | null
          diferencia: number | null
          esperado: number | null
          momento: string | null
          precio: number | null
          producto: string | null
          producto_id: string | null
          responsables: string[] | null
          turno_id: string | null
          valor: number | null
        }
        Relationships: [
          {
            foreignKeyName: "turno_stock_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turno_stock_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turno_actual"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turno_stock_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turno_stock_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos_cerrados"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos_caja_detalle: {
        Row: {
          anulado_en: string | null
          anulado_por: string | null
          caja: Database["public"]["Enums"]["caja"] | null
          creado_en: string | null
          creado_por: string | null
          delta: number | null
          id: string | null
          metodo: Database["public"]["Enums"]["metodo_pago"] | null
          monto: number | null
          motivo: string | null
          tipo: Database["public"]["Enums"]["movimiento_tipo"] | null
          turno_id: string | null
        }
        Insert: {
          anulado_en?: string | null
          anulado_por?: string | null
          caja?: Database["public"]["Enums"]["caja"] | null
          creado_en?: string | null
          creado_por?: string | null
          delta?: never
          id?: string | null
          metodo?: Database["public"]["Enums"]["metodo_pago"] | null
          monto?: number | null
          motivo?: string | null
          tipo?: Database["public"]["Enums"]["movimiento_tipo"] | null
          turno_id?: string | null
        }
        Update: {
          anulado_en?: string | null
          anulado_por?: string | null
          caja?: Database["public"]["Enums"]["caja"] | null
          creado_en?: string | null
          creado_por?: string | null
          delta?: never
          id?: string | null
          metodo?: Database["public"]["Enums"]["metodo_pago"] | null
          monto?: number | null
          motivo?: string | null
          tipo?: Database["public"]["Enums"]["movimiento_tipo"] | null
          turno_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_caja_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turno_actual"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_caja_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_caja_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos_cerrados"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos_detalle: {
        Row: {
          alumno: string | null
          alumno_id: string | null
          anulada_en: string | null
          caja: Database["public"]["Enums"]["caja"] | null
          creado_en: string | null
          id: string | null
          metodo: Database["public"]["Enums"]["metodo_pago"] | null
          monto: number | null
          producto: string | null
          turno_id: string | null
          venta_creada_en: string | null
          venta_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pagos_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turno_actual"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos_cerrados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas_saldo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos_cuenta"
            referencedColumns: ["id"]
          },
        ]
      }
      promos_detalle: {
        Row: {
          activa: boolean | null
          creado_en: string | null
          cuantos: number | null
          id: string | null
          integrantes: string[] | null
          nombre: string | null
          precio: number | null
          producto: string | null
          producto_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promos_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      tareas_detalle: {
        Row: {
          alumno: string | null
          alumno_id: string | null
          categoria: string | null
          categoria_id: string | null
          creado_en: string | null
          detalle: string | null
          estado: Database["public"]["Enums"]["tarea_estado"] | null
          id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tareas_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "tarea_categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      turno_actual: {
        Row: {
          abierto_en: string | null
          caja_chica_esperada: number | null
          caja_chica_inicial: number | null
          caja_grande_esperada: number | null
          caja_grande_inicial: number | null
          id: string | null
          movimientos_chica: number | null
          movimientos_grande: number | null
          responsables: string[] | null
          responsables_detalle: Json | null
          ventas_chica: number | null
          ventas_grande: number | null
        }
        Relationships: []
      }
      turnos_cerrados: {
        Row: {
          abierto_en: string | null
          caja_chica_esperada: number | null
          caja_chica_final: number | null
          caja_chica_inicial: number | null
          caja_grande_esperada: number | null
          caja_grande_final: number | null
          caja_grande_inicial: number | null
          cerrado_en: string | null
          contados: number | null
          dif_chica: number | null
          dif_grande: number | null
          id: string | null
          nota_cierre: string | null
          responsables: string[] | null
          responsables_detalle: Json | null
        }
        Relationships: []
      }
      ventas_saldo: {
        Row: {
          alumno: string | null
          alumno_id: string | null
          anulada_en: string | null
          cantidad: number | null
          categoria: Database["public"]["Enums"]["categoria_producto"] | null
          creado_en: string | null
          creado_por: string | null
          efectivo: number | null
          id: string | null
          no_paga: number | null
          pagado: number | null
          precio_unitario: number | null
          producto: string | null
          producto_id: string | null
          saldo: number | null
          total: number | null
          transferencia: number | null
          turno_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ventas_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turno_actual"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos_cerrados"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      abrir_turno: {
        Args: {
          p_abierto_en?: string
          p_caja_chica: number
          p_caja_grande: number
          p_stock?: Json
        }
        Returns: string
      }
      anular_movimiento: {
        Args: { p_movimiento_id: string }
        Returns: undefined
      }
      anular_pago: { Args: { p_pago_id: string }; Returns: undefined }
      anular_venta: { Args: { p_venta_id: string }; Returns: undefined }
      borrar_movimiento: {
        Args: { p_movimiento_id: string }
        Returns: undefined
      }
      borrar_venta: { Args: { p_venta_id: string }; Returns: undefined }
      cerrar_turno: {
        Args: {
          p_caja_chica: number
          p_caja_grande: number
          p_cerrado_en?: string
          p_nota?: string
          p_stock?: Json
        }
        Returns: undefined
      }
      create_staff: {
        Args: { p_email: string; p_password: string; p_role?: string }
        Returns: string
      }
      editar_salida: {
        Args: { p_id: string; p_salio: string }
        Returns: undefined
      }
      empleados_en: {
        Args: { p_desde: string; p_hasta?: string }
        Returns: {
          asistencia_id: string
          empleado_id: string
          entro: string
          nombre: string
          salio: string
        }[]
      }
      es_admin: { Args: never; Returns: boolean }
      fichar_asistencia: {
        Args: { p_empleado: string; p_salida: string }
        Returns: string
      }
      registrar_cobro: {
        Args: {
          p_alumno_id: string
          p_efectivo?: number
          p_transferencia?: number
        }
        Returns: number
      }
      registrar_lote: {
        Args: { p_cobros?: Json; p_movimientos?: Json; p_ventas?: Json }
        Returns: number
      }
      registrar_movimiento: {
        Args: {
          p_caja?: Database["public"]["Enums"]["caja"]
          p_metodo?: Database["public"]["Enums"]["metodo_pago"]
          p_monto: number
          p_motivo: string
          p_tipo: Database["public"]["Enums"]["movimiento_tipo"]
        }
        Returns: string
      }
      registrar_pago: {
        Args: {
          p_metodo: Database["public"]["Enums"]["metodo_pago"]
          p_monto: number
          p_venta_id: string
        }
        Returns: number
      }
      registrar_ventas: { Args: { p_items: Json }; Returns: number }
      responsables_entre: {
        Args: { p_desde: string; p_hasta: string }
        Returns: {
          detalle: Json
          nombres: string[]
        }[]
      }
      set_staff_role: {
        Args: { p_email: string; p_role: string }
        Returns: undefined
      }
      sumar_stock: {
        Args: { p_cantidad: number; p_producto_id: string }
        Returns: number
      }
    }
    Enums: {
      caja: "grande" | "chica"
      categoria_producto: "mensualidad" | "consumible" | "suplemento"
      genero: "femenino" | "masculino" | "otro"
      metodo_pago: "efectivo" | "transferencia" | "no_paga"
      movimiento_tipo: "ingreso" | "egreso"
      tarea_estado: "pendiente" | "en_proceso" | "terminada"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      caja: ["grande", "chica"],
      categoria_producto: ["mensualidad", "consumible", "suplemento"],
      genero: ["femenino", "masculino", "otro"],
      metodo_pago: ["efectivo", "transferencia", "no_paga"],
      movimiento_tipo: ["ingreso", "egreso"],
      tarea_estado: ["pendiente", "en_proceso", "terminada"],
    },
  },
} as const

