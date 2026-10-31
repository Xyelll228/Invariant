#include <cstddef>
#include <vector>

// Вставка сдвигами: вставляемый элемент хранится в key, а большие элементы
// сдвигаются вправо по одному. Тот же алгоритм, что insertionSortShift на JavaScript.
void insertion_sort_shift(std::vector<long long>& a) {
    for (std::size_t i = 1; i < a.size(); ++i) {
        const long long key = a[i];
        std::size_t j = i;
        while (j > 0 && a[j - 1] > key) {
            a[j] = a[j - 1];
            --j;
        }
        a[j] = key;
    }
}
