package com.sarencurrie.deemake

import org.assertj.core.api.Assertions
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import java.time.LocalDate

class HolidaysTest {
    @ParameterizedTest
    @ValueSource(
        strings = [
            "2022-01-01", // Static holiday
            "2022-01-03", // Mondayised holiday
            "2022-01-04", // Tuesdayised holiday
            "2022-04-15", // Easter Friday
            "2022-04-18", // Easter Monday
            "2022-06-06", // Queen's Birthday (first Monday)
            "2022-06-24", // Matariki
            "2022-10-24", // Labour Day (fourth Monday)
        ]
    )
    fun shouldReturnTrueForHolidays(date: LocalDate) {
        Assertions.assertThat(Holidays(2022).isHoliday(date)).isTrue
    }

    @ParameterizedTest
    @ValueSource(
        strings = [
            "2022-01-05",
            "2022-01-06",
            "2022-01-07",
            "2022-04-01",
            "2022-04-06",
            "2022-06-05",
            "2022-06-25",
            "2022-10-23",
        ]
    )
    fun shouldReturnFalseForHolidays(date: LocalDate) {
        Assertions.assertThat(Holidays(2022).isHoliday(date)).isFalse
    }
}