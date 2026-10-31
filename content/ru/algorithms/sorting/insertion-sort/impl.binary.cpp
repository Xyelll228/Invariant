#include <cstddef>
#include <vector>

// Бинарные вставки: место для key ищется бинарным поиском, затем элементы
// сдвигаются вправо. Тот же алгоритм, что binaryInsertionSort на JavaScript.
void binary_insertion_sort(std::vector<long long>& a) {
    for (std::size_t i = 1; i < a.size(); ++i) {
        const long long key = a[i];
        // Первое место в a[0..i - 1], где элемент больше key: равные остаются левее.
        std::size_t lo = 0;
        std::size_t hi = i;
        while (lo < hi) {
            const std::size_t mid = lo + (hi - lo) / 2;
            if (a[mid] > key) {
                hi = mid;
            } else {
                lo = mid + 1;
            }
        }
        for (std::size_t j = i; j > lo; --j) {
            a[j] = a[j - 1];
        }
        a[lo] = key;
    }
}
