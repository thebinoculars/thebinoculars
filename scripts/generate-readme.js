const fs = require('fs')

const formatDate = (timestamp, timezoneOffset) => {
	const date = new Date((timestamp + timezoneOffset) * 1000)
	const day = String(date.getUTCDate()).padStart(2, '0')
	const month = String(date.getUTCMonth() + 1).padStart(2, '0')
	const hours = String(date.getUTCHours()).padStart(2, '0')
	const minutes = String(date.getUTCMinutes()).padStart(2, '0')
	return `${day}/${month} ${hours}:${minutes}`
}

const getCurrentDate = () => {
	const date = new Date()
	const day = String(date.getDate()).padStart(2, '0')
	const month = String(date.getMonth() + 1).padStart(2, '0')
	return `${day}/${month}`
}

const main = async () => {
	try {
		const apiKey = process.env.API_KEY
		const lat = 21.027763
		const lon = 105.83416
		const lang = 'en'
		const units = 'metric'

		const [forecastRes, weatherRes] = await Promise.all([
			fetch(
				`https://api.openweathermap.org/data/2.5/forecast?appid=${apiKey}&lat=${lat}&lon=${lon}&lang=${lang}&units=${units}`
			),
			fetch(
				`https://api.openweathermap.org/data/2.5/weather?appid=${apiKey}&lat=${lat}&lon=${lon}&lang=${lang}&units=${units}`
			),
		])

		const forecastData = await forecastRes.json()
		const weatherData = await weatherRes.json()

		const { list } = forecastData
		const { main, weather, wind, visibility, timezone } = weatherData

		const icons = {
			Thunderstorm: '⚡',
			Drizzle: '🌧️',
			Rain: '⛈️',
			Snow: '❄️',
			Atmosphere: '🌫️',
			Clear: '☀️',
			Clouds: '☁️',
		}

		const weatherTemplate = (weather) =>
			weather
				.map((item) => `${icons[item.main] || '🌦️'} ${item.description}`)
				.join(', ')

		const hourly = list
			.map(
				(item) =>
					`| ${formatDate(item.dt, timezone)} | ${
						item.main.temp_min
					}\u2103 - ${item.main.temp_max}\u2103 | ${item.main.humidity}% | ${
						item.visibility / 1000
					}km | ${weatherTemplate(item.weather)} |`
			)
			.join('\n')

		const template = `## 🌦️ Hanoi Weather (${getCurrentDate()})

### Current

- 🌡️ Temperature: ${main.temp}\u2103
- 💦 Humidity: ${main.humidity}%
- 💨 Wind Speed: ${wind.speed}m/s
- 👁️ Visibility: ${visibility / 1000}km
- ☂️ Weather: ${weatherTemplate(weather)}

### Upcoming

| Time | Temperature | Humidity | Visibility | Weather |
| --- | --- | --- | --- | --- |
${hourly}
`

		fs.writeFileSync('README.md', template)
	} catch (error) {
		console.error(error)
	}
}

main()
