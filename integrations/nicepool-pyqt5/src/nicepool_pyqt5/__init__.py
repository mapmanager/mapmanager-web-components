"""PyQt5 adapter for the MapManager NicePool web component."""

from .data import dataframe_to_dataset, records_to_dataset
from .widget import NicePoolWidget

__all__ = ["NicePoolWidget", "dataframe_to_dataset", "records_to_dataset"]

