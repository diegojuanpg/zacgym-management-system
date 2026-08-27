#!/usr/bin/env python3
"""Descarga historico completo de check-ins de pulsoflow.app via su API.

Uso:
    python fetch_checkins.py --token "Bearer eyJhbGciOi..." [--out checkins.csv]

El token sale del browser ya logueado: DevTools > Network > cualquier request
a api.pulsoflow.app > header "authorization" (Bearer ...). Dura ~1h, alcanza
para bajar todo el historico en una corrida.
"""
import argparse
import csv
import json
import sys
import urllib.error
import urllib.request

API = "https://api.pulsoflow.app"
PAGE_SIZE = 200


def api_get(path, token):
    req = urllib.request.Request(f"{API}{path}", headers={"authorization": token})
    try:
        with urllib.request.urlopen(req) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        if e.code == 401:
            sys.exit("Token vencido o invalido. Sacá uno nuevo del browser y reintenta.")
        sys.exit(f"Error {e.code} en {path}: {body}")


def get_service_id(token):
    services = api_get("/services", token)
    if not services:
        sys.exit("No hay services asociados a este usuario/token.")
    return services[0]["id"]


def fetch_all_checkins(service_id, token):
    checkins = []
    offset = 0
    while True:
        page = api_get(
            f"/checkins/service/{service_id}?limit={PAGE_SIZE}&offset={offset}", token
        )
        checkins.extend(page)
        if len(page) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return checkins


def flatten(c):
    user = c.get("user") or {}
    membership = c.get("membership") or {}
    return {
        "checkInTime": c.get("checkInTime"),
        "checkOutTime": c.get("checkOutTime"),
        "status": c.get("status"),
        "userName": user.get("name"),
        "userEmail": user.get("email"),
        "userId": c.get("userId"),
        "branchId": c.get("branchId"),
        "membershipId": c.get("membershipId"),
        "membershipDurationDays": membership.get("durationDays"),
        "id": c.get("id"),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--token", required=True, help='Header completo, ej: "Bearer eyJ..."')
    parser.add_argument("--out", default="checkins.csv")
    args = parser.parse_args()

    token = args.token if args.token.lower().startswith("bearer ") else f"Bearer {args.token}"

    service_id = get_service_id(token)
    checkins = fetch_all_checkins(service_id, token)
    checkins.sort(key=lambda c: c.get("checkInTime") or "")

    rows = [flatten(c) for c in checkins]
    with open(args.out, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()) if rows else [])
        writer.writeheader()
        writer.writerows(rows)

    print(f"{len(rows)} check-ins guardados en {args.out}")


if __name__ == "__main__":
    main()
