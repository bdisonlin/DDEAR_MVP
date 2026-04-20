"""
In-memory data store for baseline load series + metadata.
For production K8s with multiple replicas, replace with Redis + serialisation.
"""
import threading
from dataclasses import dataclass, field
from typing import Optional
import pandas as pd

_lock = threading.Lock()


@dataclass
class BaselineRecord:
    series:        pd.Series
    voltage:       str           = "high"
    contracted_kw: Optional[float] = None
    bill_type:     str           = "tiered"


_store: dict[str, BaselineRecord] = {}


def save(
    data_id:       str,
    series:        pd.Series,
    voltage:       str = "high",
    contracted_kw: Optional[float] = None,
    bill_type:     str = "tiered",
) -> None:
    with _lock:
        _store[data_id] = BaselineRecord(
            series=series,
            voltage=voltage,
            contracted_kw=contracted_kw,
            bill_type=bill_type,
        )


def load(data_id: str) -> Optional[BaselineRecord]:
    with _lock:
        return _store.get(data_id)


def delete(data_id: str) -> None:
    with _lock:
        _store.pop(data_id, None)
