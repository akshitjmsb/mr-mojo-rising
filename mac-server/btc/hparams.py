"""HParams loader for BTC config — vendored from BTC-ISMIR19 (utils/hparams.py).

Source: https://github.com/jayg996/BTC-ISMIR19
License: MIT (see upstream repo).

Modified: yaml.load → yaml.safe_load to silence the unsafe-loader warning.
"""

import yaml


class HParams(object):
    def __init__(self, **kwargs):
        self.__dict__ = kwargs

    def add(self, **kwargs):
        self.__dict__.update(kwargs)

    def update(self, **kwargs):
        self.__dict__.update(kwargs)
        return self

    def __repr__(self):
        return "\nHyperparameters:\n" + "\n".join(
            [" {}={}".format(k, v) for k, v in self.__dict__.items()]
        )

    @classmethod
    def load(cls, path):
        with open(path, "r") as f:
            return cls(**yaml.safe_load(f))
