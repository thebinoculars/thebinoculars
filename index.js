require('dotenv').config()
const axios = require('axios')
const moment = require('moment')
const fs = require('fs');

(async () => {
  try {
    const { data } = await axios.get('https://api.openweathermap.org/data/2.5/onecall', {
      params: {
        APPID: process.env.API_KEY,
        lat: 21.027763,
        lon: 105.83416,
        lang: 'vi',
        units: 'metric'
      }
    })

    const icons = {
      'Thunderstorm': '⚡',
      'Drizzle': '🌧️',
      'Rain': '⛈️',
      'Snow': '❄️',
      'Atmosphere': '🌫️',
      'Clear': '☀️',
      'Clouds': '☁️'
    }

    const weatherTemplate = weather => weather.map(item => `${icons[item.main] || '🌦️'} ${item.description}`).join(', ')

    const UVStatus = index => {
      if (index < 3) return 'thấp'
      if (index < 6) return 'trung bình'
      if (index < 8) return 'cao'
      if (index < 11) return 'rất cao'
      return 'độc hại'
    }

    const daily = data.daily.map(item => `| ${moment((item.dt + data.timezone_offset) * 1000).format('DD/MM')} | ${item.temp.min}\u2103 - ${item.temp.max}\u2103 | ${item.humidity}% | ${item.uvi} (${UVStatus(item.uvi)}) | ${weatherTemplate(item.weather)} |`).join('\n')

    const hourly = data.hourly.map(item => `| ${moment((item.dt + data.timezone_offset) * 1000).format('DD/MM HH:mm')} | ${item.temp}\u2103 | ${item.humidity}% | ${item.visibility / 1000}km | ${weatherTemplate(item.weather)} |`).join('\n')

    const template = `## 🌦️ Thời tiết Hà Nội (${moment().format('DD/MM')})

### Hiện tại

- 🌡️ Nhiệt độ: ${data.current.temp}\u2103
- 💦 Độ ẩm: ${data.current.humidity}%
- 🌟 Chỉ số tia UV: ${data.current.uvi} (${UVStatus(data.current.uvi)})
- 👁️ Tầm nhìn xa: ${data.current.visibility / 1000}km
- ☂️ Thời tiết: ${weatherTemplate(data.current.weather)}

### 7 ngày tới

| Ngày | Nhiệt độ | Độ ẩm | Chỉ số tia UV | Thời tiết |
| --- | --- | --- | --- | --- |
${daily}

### Sắp tới

| Thời gian | Nhiệt độ | Độ ẩm | Tầm nhìn xa | Thời tiết |
| --- | --- | --- | --- | --- |
${hourly}
`

    fs.writeFileSync('README.md', template)
  } catch (error) {
    console.error(error)
  }
})()
