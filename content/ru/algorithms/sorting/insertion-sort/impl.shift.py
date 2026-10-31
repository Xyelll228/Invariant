def insertion_sort_shift(a: list[int]) -> list[int]:
    """Вставка сдвигами: тот же алгоритм, что insertionSortShift на JavaScript."""
    for i in range(1, len(a)):
        key = a[i]
        j = i
        while j > 0 and a[j - 1] > key:
            a[j] = a[j - 1]
            j -= 1
        a[j] = key
    return a
