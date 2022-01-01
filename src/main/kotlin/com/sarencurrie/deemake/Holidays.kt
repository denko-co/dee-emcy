package com.sarencurrie.deemake

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.Month
import java.time.MonthDay
import java.time.temporal.TemporalAdjusters

class Holidays(year: Int) {
    private val staticHolidays = listOf(
        MonthDay.of(Month.JANUARY, 1),
        MonthDay.of(Month.JANUARY, 2),
        MonthDay.of(Month.FEBRUARY, 6),
        MonthDay.of(Month.APRIL, 25),
        MonthDay.of(Month.DECEMBER, 25),
        MonthDay.of(Month.DECEMBER, 26),
    )

    private val holidayList: MutableList<LocalDate> = mutableListOf()

    // Move holiday to the next day if it falls on another holiday or a weekend
    // There might be some cases where this will not apply (Easter and Anzac Day in 2038?) but if we don't get a
    // substitute public holiday in that case, Dee will just get one anyway.
    private fun mondayise(year: Int, holiday: MonthDay): LocalDate {
        val absoluteDate = holiday.atYear(year)
        return mondayise(absoluteDate)
    }

    private fun mondayise(absoluteDate: LocalDate): LocalDate {
        return if (absoluteDate.dayOfWeek == DayOfWeek.SATURDAY ||
            absoluteDate.dayOfWeek == DayOfWeek.SUNDAY ||
            holidayList.contains(absoluteDate)
        ) {
            mondayise(absoluteDate.plusDays(1))
        } else {
            absoluteDate
        }
    }

    private fun dynamicHolidays(year: Int): List<LocalDate> {
        return listOf(
            // Auckland anniversary, first Monday on or after January 29
            LocalDate.of(year, Month.JANUARY, 29).with(TemporalAdjusters.next(DayOfWeek.MONDAY)),
            easterFriday(year),
            easterMonday(year),
            // Queens birthday, first Monday in June
            LocalDate.of(year, Month.JUNE, 1).with(TemporalAdjusters.firstInMonth(DayOfWeek.MONDAY)),
            matarikis[year] ?: throw RuntimeException("No Matariki date for year $year"),
            // Labour day, fourth Monday in October
            LocalDate.of(year, Month.OCTOBER, 1).with(TemporalAdjusters.dayOfWeekInMonth(4, DayOfWeek.MONDAY)),
        )
    }

    private val matarikis = mapOf(
        2022 to LocalDate.of(2022, Month.JUNE, 24),
        2023 to LocalDate.of(2023, Month.JULY, 14),
        2024 to LocalDate.of(2024, Month.JUNE, 28),
        2025 to LocalDate.of(2025, Month.JUNE, 20),
        2026 to LocalDate.of(2026, Month.JULY, 10),
        2027 to LocalDate.of(2027, Month.JUNE, 25),
        2028 to LocalDate.of(2028, Month.JULY, 14),
        2029 to LocalDate.of(2029, Month.JULY, 6),
        2030 to LocalDate.of(2030, Month.JUNE, 21),
        2031 to LocalDate.of(2031, Month.JULY, 11),
        2032 to LocalDate.of(2032, Month.JULY, 2),
        2033 to LocalDate.of(2033, Month.JUNE, 24),
        2034 to LocalDate.of(2034, Month.JULY, 7),
        2035 to LocalDate.of(2035, Month.JUNE, 29),
        2036 to LocalDate.of(2036, Month.JULY, 18),
        2037 to LocalDate.of(2037, Month.JULY, 10),
        2038 to LocalDate.of(2038, Month.JUNE, 25),
        2039 to LocalDate.of(2039, Month.JULY, 15),
        2040 to LocalDate.of(2040, Month.JULY, 6),
        2041 to LocalDate.of(2041, Month.JULY, 19),
        2042 to LocalDate.of(2042, Month.JULY, 11),
        2043 to LocalDate.of(2043, Month.JULY, 3),
        2044 to LocalDate.of(2044, Month.JUNE, 24),
        2045 to LocalDate.of(2045, Month.JULY, 7),
        2046 to LocalDate.of(2046, Month.JUNE, 29),
        2047 to LocalDate.of(2047, Month.JULY, 19),
        2048 to LocalDate.of(2048, Month.JULY, 3),
        2049 to LocalDate.of(2049, Month.JUNE, 25),
        2050 to LocalDate.of(2050, Month.JULY, 15),
        2051 to LocalDate.of(2051, Month.JUNE, 30),
        2052 to LocalDate.of(2052, Month.JUNE, 21),
        // I like to imagine Dee will still be a thing in 2053...
    )

    // Before you accuse me of witchcraft, see https://en.wikipedia.org/wiki/Date_of_Easter#Gauss's_Easter_algorithm
    private fun easterSunday(year: Int): LocalDate {
        val a = year % 19
        val b = year / 100
        val c = year % 100
        val d = b / 4
        val e = b % 4
        val f = (b + 8) / 25
        val g = (b - f + 1) / 3
        val h = (19 * a + b - d - g + 15) % 30
        val i = c / 4
        val k = c % 4
        val l = (32 + 2 * e + 2 * i - h - k) % 7
        val m = (a + 11 * h + 22 * l) / 451
        val month = (h + l - 7 * m + 114) / 31
        val day = (h + l - 7 * m + 114) % 31 + 1
        return LocalDate.of(year, month, day)
    }

    private fun easterFriday(year: Int): LocalDate = easterSunday(year).minusDays(2)

    private fun easterMonday(year: Int): LocalDate = easterSunday(year).plusDays(1)

    fun isHoliday(date: LocalDate): Boolean = holidayList.contains(date)

    init {
        staticHolidays.forEach {
            holidayList.add(mondayise(year, it))
            holidayList.add(it.atYear(year)) // Still add the default day if also mondayised
        }
        dynamicHolidays(year).forEach {
            holidayList.add(mondayise(it))
            holidayList.add(it) // Still add the default day if also mondayised
        }
    }

}

