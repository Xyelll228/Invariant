#include <cstddef>
#include <utility>
#include <vector>

// Сортировка вставками обменами: тот же алгоритм, что и эталон на JavaScript.
void insertion_sort(std::vector<long long>& a) {
    for (std::size_t i = 1; i < a.size(); ++i) {
        for (std::size_t j = i; j > 0 && a[j - 1] > a[j]; --j) {
            std::swap(a[j - 1], a[j]);
        }
    }
}
