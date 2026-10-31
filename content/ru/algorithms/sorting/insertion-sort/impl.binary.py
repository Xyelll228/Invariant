def binary_insertion_sort(a: list[int]) -> list[int]:
    """Бинарные вставки: тот же алгоритм, что binaryInsertionSort на JavaScript."""
    for i in range(1, len(a)):
        key = a[i]
        # Первое место в a[0..i - 1], где элемент больше key: равные остаются левее.
        lo, hi = 0, i
        while lo < hi:
            mid = lo + (hi - lo) // 2
            if a[mid] > key:
                hi = mid
            else:
                lo = mid + 1
        for j in range(i, lo, -1):
            a[j] = a[j - 1]
        a[lo] = key
    return a
