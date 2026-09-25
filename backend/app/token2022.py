"""Decode a Token-2022 mint account (jsonParsed) into the PreNAV safety sheet."""

from __future__ import annotations

import time
from typing import Any


def _ext(extensions: list[dict[str, Any]], name: str) -> dict[str, Any] | None:
    for e in extensions:
        if e.get("extension") == name:
            return e.get("state") or {}
    return None


def current_multiplier(scaled_cfg: dict[str, Any] | None, now: int | None = None) -> float:
    """Effective scaled-UI multiplier right now."""
    if not scaled_cfg:
        return 1.0
    now = now if now is not None else int(time.time())
    eff = scaled_cfg.get("newMultiplierEffectiveTimestamp")
    new_mult = scaled_cfg.get("newMultiplier")
    if eff is not None and new_mult is not None and int(eff) <= now:
        return float(new_mult)
    try:
        return float(scaled_cfg.get("multiplier", 1) or 1)
    except (TypeError, ValueError):
        return 1.0


def decode_safety(account_value: dict[str, Any], epoch: int | None = None, now: int | None = None) -> dict[str, Any]:
    """account_value = getAccountInfo(...,jsonParsed).value -> safety sheet dict."""
    data = account_value.get("data") or {}
    parsed = (data.get("parsed") or {}).get("info") or {}
    extensions = parsed.get("extensions") or []
    now = now if now is not None else int(time.time())

    fee_cfg = _ext(extensions, "transferFeeConfig")
    delegate = _ext(extensions, "permanentDelegate")
    hook = _ext(extensions, "transferHook")
    scaled = _ext(extensions, "scaledUiAmountConfig")
    conf = _ext(extensions, "confidentialTransferMint")
    pausable = _ext(extensions, "pausableConfig")
    default_state = _ext(extensions, "defaultAccountState")

    fee_newer = (fee_cfg or {}).get("newerTransferFee") or {}
    fee_older = (fee_cfg or {}).get("olderTransferFee") or {}
    # The "newer" fee config applies once its epoch is reached.
    if epoch is not None and fee_newer.get("epoch") is not None and epoch < int(fee_newer["epoch"]):
        fee_bps = fee_older.get("transferFeeBasisPoints")
        pending_bps = fee_newer.get("transferFeeBasisPoints")
    else:
        fee_bps = fee_newer.get("transferFeeBasisPoints")
        pending_bps = None
        if fee_newer.get("epoch") is not None and epoch is not None and epoch < int(fee_newer["epoch"]):
            pending_bps = fee_newer.get("transferFeeBasisPoints")
    decimals = int(parsed.get("decimals", 0) or 0)
    mult = current_multiplier(scaled, now)

    mint_auth = parsed.get("mintAuthority")
    freeze_auth = parsed.get("freezeAuthority")
    withheld_raw = int((fee_cfg or {}).get("withheldAmount", 0) or 0)
    withheld_ui = withheld_raw / (10**decimals) if decimals else 0.0
    paused = bool((pausable or {}).get("paused"))

    flags: list[dict[str, str]] = []
    if delegate and delegate.get("delegate"):
        flags.append(
            {
                "key": "permanent_delegate",
                "severity": "high",
                "explain": (
                    "A permanent delegate is set: the issuer can move or burn tokens "
                    "out of any wallet without the owner's approval."
                ),
            }
        )
    if freeze_auth:
        flags.append(
            {
                "key": "freeze_authority",
                "severity": "high",
                "explain": (
                    "Freeze authority is active: the issuer can freeze your token account at any time, blocking transfers."
                ),
            }
        )
    if fee_bps and fee_bps >= 50:
        flags.append(
            {
                "key": "transfer_fee",
                "severity": "medium",
                "explain": f"Every transfer pays a {fee_bps / 100:.2f}% fee to the issuer (withheld at the token account).",
            }
        )
    if mint_auth:
        flags.append(
            {
                "key": "mint_authority",
                "severity": "medium",
                "explain": "Mint authority is active: the issuer can mint unlimited new tokens (supply is not fixed).",
            }
        )
    if pausable is not None:
        flags.append(
            {
                "key": "pausable",
                "severity": "medium",
                "explain": "Token is pausable: the issuer can halt all transfers globally."
                if not paused
                else "Transfers are currently PAUSED globally by the issuer.",
            }
        )
    if hook is not None:
        flags.append(
            {
                "key": "transfer_hook",
                "severity": "low",
                "explain": (
                    "A transfer hook is configured: every transfer invokes a custom program that can reject or act on transfers."
                )
                if hook.get("programId")
                else ("A transfer-hook slot is configured but no hook program is set yet (can be enabled later by the issuer)."),
            }
        )
    if scaled and mult != 1.0:
        flags.append(
            {
                "key": "scaled_ui",
                "severity": "low",
                "explain": (
                    f"Amounts are scaled {mult:g}x for display (scaled-UI extension): "
                    "raw on-chain amounts differ from what wallets show."
                ),
            }
        )
    if conf is not None:
        flags.append(
            {
                "key": "confidential",
                "severity": "info",
                "explain": ("Confidential transfers are enabled on the mint (balances can be encrypted at the account level)."),
            }
        )

    return {
        "program": data.get("program"),
        "decimals": decimals,
        "mintAuthority": mint_auth,
        "freezeAuthority": freeze_auth,
        "transferFeeBps": fee_bps,
        "pendingFeeBps": pending_bps,
        "withheld": withheld_ui * mult,
        "permanentDelegate": (delegate or {}).get("delegate"),
        "transferHook": (hook or {}).get("programId"),
        "transferHookAuthority": (hook or {}).get("authority"),
        "scaledUiMultiplier": mult,
        "pendingScaledUiMultiplier": float(scaled["newMultiplier"])
        if scaled and scaled.get("newMultiplier") is not None and float(scaled.get("newMultiplier")) != mult
        else None,
        "confidential": conf is not None,
        "pausable": pausable is not None,
        "paused": paused,
        "defaultAccountState": (default_state or {}).get("accountState"),
        "supplyRaw": parsed.get("supply"),
        "flags": flags,
    }
