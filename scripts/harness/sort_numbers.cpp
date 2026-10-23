// Обвязка для проверки версии темы на C++ (harness: sort-numbers).
// Читает тесты из стандартного ввода: n и затем n чисел. Вызывает функцию
// темы, имя которой передаётся при компиляции (-DINVARIANT_FUNCTION=...),
// и печатает результат в одну строку через пробел.
#include <cstddef>
#include <iostream>
#include <vector>

void INVARIANT_FUNCTION(std::vector<long long>& a);

int main() {
    std::size_t n = 0;
    while (std::cin >> n) {
        std::vector<long long> a(n);
        for (auto& x : a) {
            std::cin >> x;
        }
        INVARIANT_FUNCTION(a);
        for (std::size_t i = 0; i < a.size(); ++i) {
            std::cout << (i > 0 ? " " : "") << a[i];
        }
        std::cout << '\n';
    }
    return 0;
}
