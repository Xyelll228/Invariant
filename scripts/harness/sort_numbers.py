"""Обвязка для проверки версии темы на Python (harness: sort-numbers).

Аргументы: путь к impl.py и имя функции. Каждая строка ввода — JSON-массив
чисел; функция получает список, результат печатается JSON-массивом. Если
функция сортирует на месте и ничего не возвращает, печатается сам список.
"""

import importlib.util
import json
import sys


def main() -> None:
    path, name = sys.argv[1], sys.argv[2]
    spec = importlib.util.spec_from_file_location("impl", path)
    if spec is None or spec.loader is None:
        raise SystemExit(f"не загрузить {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    function = getattr(module, name)
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        values = json.loads(line)
        result = function(values)
        print(json.dumps(values if result is None else result))


if __name__ == "__main__":
    main()
