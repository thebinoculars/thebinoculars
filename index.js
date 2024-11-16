require('dotenv').config()
const axios = require('axios')
const moment = require('moment')
const fs = require('fs')

const main = async () => {
	try {
		const params = {
			appid: process.env.API_KEY,
			lat: 21.027763,
			lon: 105.83416,
			lang: 'vi',
			units: 'metric',
		}

		const [
			{
				data: { list },
			},
			{
				data: { main, weather, wind, visibility, timezone },
			},
		] = await axios.all([
			axios.get(`https://api.openweathermap.org/data/2.5/forecast`, { params }),
			axios.get(`https://api.openweathermap.org/data/2.5/weather`, { params }),
		])

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
					`| ${moment((item.dt + timezone) * 1000).format('DD/MM HH:mm')} | ${
						item.main.temp_min
					}\u2103 - ${item.main.temp_max}\u2103 | ${item.main.humidity}% | ${
						item.visibility / 1000
					}km | ${weatherTemplate(item.weather)} |`
			)
			.join('\n')

		const template = `## 🌦️ Thời tiết Hà Nội (${moment().format('DD/MM')})

### Hiện tại

- 🌡️ Nhiệt độ: ${main.temp}\u2103
- 💦 Độ ẩm: ${main.humidity}%
- 💨 Sức gió: ${wind.speed}m/s
- 👁️ Tầm nhìn xa: ${visibility / 1000}km
- ☂️ Thời tiết: ${weatherTemplate(weather)}

### Sắp tới

| Thời gian | Nhiệt độ | Độ ẩm | Tầm nhìn xa | Thời tiết |
| --- | --- | --- | --- | --- |
${hourly}
`

		fs.writeFileSync('README.md', template)
	} catch (error) {
		console.error(error)
	}
}

main()
