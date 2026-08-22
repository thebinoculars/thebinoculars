const fs = require('fs')
const path = require('path')

// ================= CONFIG & CONSTANTS =================
const CONFIG = {
  lat: 21.027763,
  lon: 105.83416,
  timezone: 'Asia/Ho_Chi_Minh',
  bingBaseURL: 'https://www.bing.com',
  archivesDir: path.join(__dirname, 'archives'),
  templatePath: path.join(__dirname, 'template.md'),
  outputReadme: path.join(__dirname, 'README.md')
}

const WEATHER_CODES = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Depositing rime fog', 51: 'Light drizzle', 53: 'Moderate drizzle',
  55: 'Dense drizzle', 61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
  71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
  85: 'Slight snow showers', 86: 'Heavy snow showers', 95: 'Thunderstorm',
  96: 'Thunderstorm with hail', 99: 'Thunderstorm with heavy hail'
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

// ================= UTILS =================
const formatDate = (dateString) => {
  const date = new Date(dateString)
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

const getCurrentDate = () => new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

const formatDateForAPI = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate()
const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay()

const getWeatherCodeDescription = (code) => WEATHER_CODES[code] || 'Unknown'

const getWeatherIcon = (code) => {
  if (code === 0) return '☀️'
  if (code <= 3) return '☁️'
  if (code <= 48) return '🌫️'
  if (code <= 65) return '🌧️'
  if (code <= 77) return '❄️'
  if (code <= 82) return '🌧️'
  if (code <= 86) return '❄️'
  if (code <= 99) return '⚡'
  return '🌦️'
}

const modifyImageUrl = (imageUrl, res = 'UHD') => {
  if (!imageUrl) return imageUrl
  const newImageUrl = imageUrl.replace(/_\d+x\d+\.jpg/, `_${res}.jpg`)
  try {
    const url = new URL(newImageUrl)
    url.searchParams.delete('rf')
    url.searchParams.delete('pid')
    return url.toString()
  } catch {
    return newImageUrl
  }
}

const generatePlaceholderImage = (width = 120, height = 68, text, bgColor = 'transparent', textColor = '666666') => {
  return `https://placehold.co/${width}x${height}/${bgColor}/${textColor}?text=${encodeURIComponent(text)}`
}

// ================= STORAGE & ASSETS =================
const loadBingData = (year, month) => {
  try {
    const monthStr = String(month + 1).padStart(2, '0')
    const dataPath = path.join(CONFIG.archivesDir, `${year}-${monthStr}`, 'data.json')
    
    if (!fs.existsSync(dataPath)) return { imageMap: new Map(), copyrightMap: new Map() }
    
    const jsonData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))
    const imageMap = new Map()
    const copyrightMap = new Map()
    
    jsonData.forEach(item => {
      const dateStr = item.startdate
      const dateKey = `${parseInt(dateStr.substring(0, 4))}-${parseInt(dateStr.substring(4, 6)) - 1}-${parseInt(dateStr.substring(6, 8))}`
      
      let imageUrl = item.url
      if (!imageUrl.startsWith('http')) imageUrl = `${CONFIG.bingBaseURL}${imageUrl}`
      
      imageMap.set(dateKey, imageUrl)
      if (item.copyright) copyrightMap.set(dateKey, item.copyright)
    })
    
    return { imageMap, copyrightMap }
  } catch (error) {
    console.error('Error loading wallpaper data:', error)
    return { imageMap: new Map(), copyrightMap: new Map() }
  }
}

const fetchLatestWallpaper = async () => {
  try {
    const response = await fetch(`${CONFIG.bingBaseURL}/HPImageArchive.aspx?format=js&idx=-1&n=1&mkt=vi-VN`)
    const data = await response.json()
    if (data.images?.[0]) {
      const img = data.images[0]
      if (!img.url.startsWith('http')) img.url = `${CONFIG.bingBaseURL}${img.url}`
      return img
    }
    return null
  } catch (error) {
    console.error('Error fetching latest wallpaper:', error)
    return null
  }
}

const updateWallpaperData = async (year, month, latestWallpaper) => {
  try {
    if (!latestWallpaper) return false
    const monthStr = String(month + 1).padStart(2, '0')
    const folderPath = path.join(CONFIG.archivesDir, `${year}-${monthStr}`)
    const dataPath = path.join(folderPath, 'data.json')
    
    fs.mkdirSync(folderPath, { recursive: true })
    let existingData = fs.existsSync(dataPath) ? JSON.parse(fs.readFileSync(dataPath, 'utf-8')) : []
    
    if (existingData.some(item => item.startdate === latestWallpaper.startdate)) return false
    
    existingData.push(latestWallpaper)
    existingData.sort((a, b) => (a.startdate > b.startdate ? -1 : 1))
    fs.writeFileSync(dataPath, JSON.stringify(existingData, null, 2))
    return true
  } catch (error) {
    console.error('Error updating wallpaper data:', error)
    return false
  }
}

const loadTemplate = () => fs.readFileSync(CONFIG.templatePath, 'utf-8')

const saveMonthlyCalendar = async (year, month, markdown) => {
  try {
    const monthStr = String(month + 1).padStart(2, '0')
    const folderPath = path.join(CONFIG.archivesDir, `${year}-${monthStr}`)
    fs.mkdirSync(folderPath, { recursive: true })
    fs.writeFileSync(path.join(folderPath, 'README.md'), markdown)
    return true
  } catch (error) {
    console.error('Error saving monthly calendar:', error)
    return false
  }
}

const loadMonthlyCalendar = (year, month) => {
  try {
    const monthStr = String(month + 1).padStart(2, '0')
    const calendarPath = path.join(CONFIG.archivesDir, `${year}-${monthStr}`, 'README.md')
    return fs.existsSync(calendarPath) ? fs.readFileSync(calendarPath, 'utf-8') : null
  } catch (error) {
    console.error('Error loading monthly calendar:', error)
    return null
  }
}

const replacePlaceholders = (template, data) => {
  let content = template
  Object.keys(data).forEach(key => {
    content = content.replace(new RegExp(`{{${key}}}`, 'g'), data[key])
  })
  return content
}

// ================= WEATHER & CALENDAR GENERATION =================
const fetchWeatherData = async (targetYear, targetMonth) => {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()
  const currentDay = now.getDate()

  const firstDayOfMonth = new Date(targetYear, targetMonth, 1)
  const lastDayOfMonth = new Date(targetYear, targetMonth + 1, 0)
  
  const baseParams = `latitude=${CONFIG.lat}&longitude=${CONFIG.lon}&timezone=${CONFIG.timezone}`
  const apiCalls = []
  let mode = 'forecast'

  if (targetYear < currentYear || (targetYear === currentYear && targetMonth < currentMonth)) {
    mode = 'archive'
    const start = formatDateForAPI(firstDayOfMonth)
    const end = formatDateForAPI(lastDayOfMonth)
    apiCalls.push(fetch(`https://archive-api.open-meteo.com/v1/archive?${baseParams}&daily=temperature_2m_mean,weather_code&start_date=${start}&end_date=${end}`))
  } else if (targetYear === currentYear && targetMonth === currentMonth) {
    mode = 'mixed'
    if (currentDay > 1) {
      const start = formatDateForAPI(firstDayOfMonth)
      const end = formatDateForAPI(new Date(currentYear, currentMonth, currentDay - 1))
      apiCalls.push(fetch(`https://archive-api.open-meteo.com/v1/archive?${baseParams}&daily=temperature_2m_mean,weather_code&start_date=${start}&end_date=${end}`))
    }
    const forecastDays = Math.min(lastDayOfMonth.getDate() - currentDay + 1, 16)
    apiCalls.push(fetch(`https://api.open-meteo.com/v1/forecast?${baseParams}&daily=temperature_2m_mean,weather_code&forecast_days=${forecastDays}`))
  } else {
    const forecastDays = Math.min(lastDayOfMonth.getDate(), 16)
    apiCalls.push(fetch(`https://api.open-meteo.com/v1/forecast?${baseParams}&daily=temperature_2m_mean,weather_code&forecast_days=${forecastDays}`))
  }

  const responses = await Promise.all(apiCalls)
  const data = await Promise.all(responses.map(res => res.json()))

  let historicalData = null
  let forecastData = null

  if (mode === 'archive') {
    historicalData = data[0]
  } else if (mode === 'mixed') {
    if (currentDay > 1) {
      historicalData = data[0]
      forecastData = data[1]
    } else {
      forecastData = data[0]
    }
  } else {
    forecastData = data[0]
  }

  return { historicalData, forecastData }
}

const generateCalendar = (historicalData, forecastData, currentYear, currentMonth, currentDay, imageMap, copyrightMap, currentTemp, currentWeatherCode) => {
  const daysInMonth = getDaysInMonth(currentYear, currentMonth)
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth)
  
  const tempMap = new Map()
  const weatherCodeMap = new Map()
  
  const processDataset = (dataset) => {
    if (!dataset?.daily?.time) return
    dataset.daily.time.forEach((time, index) => {
      const dateStr = time.split('T')[0] 
      const [itemYear, itemMonth, itemDay] = dateStr.split('-').map(Number)

      if (itemYear === currentYear && (itemMonth - 1) === currentMonth) {
        const temp = dataset.daily.temperature_2m_mean[index]
        const code = dataset.daily.weather_code?.[index]
        
        if (temp != null && !isNaN(temp)) tempMap.set(itemDay, temp)
        if (code != null && !isNaN(code)) weatherCodeMap.set(itemDay, code)
      }
    })
  }

  processDataset(historicalData)
  processDataset(forecastData)
  
  const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  let calendar = `| ${dayHeaders.join(' | ')} |\n| ${dayHeaders.map(() => '---').join(' | ')} |\n`
  
  const totalCells = firstDay + daysInMonth
  const rows = Math.ceil(totalCells / 7)
  
  for (let row = 0; row < rows; row++) {
    const cells = []
    for (let col = 0; col < 7; col++) {
      const cellIndex = row * 7 + col
      if (cellIndex < firstDay || cellIndex >= firstDay + daysInMonth) {
        cells.push(' ')
      } else {
        const day = cellIndex - firstDay + 1
        const isCurrentDay = (day === currentDay)
        
        let temp = tempMap.get(day)
        if (isCurrentDay && !temp && currentTemp !== undefined) {
          temp = currentTemp
        }

        let weatherCode = weatherCodeMap.get(day)
        if (isCurrentDay && !weatherCode && currentWeatherCode !== undefined) {
          weatherCode = currentWeatherCode
        }
        const dateKey = `${currentYear}-${currentMonth}-${day}`
        const imageUrl = imageMap.get(dateKey)
        const copyright = copyrightMap.get(dateKey)
        
        let cellContent = '<div align="center">'
        const dayFormatted = String(day).padStart(2, '0')
        cellContent += isCurrentDay ? `**${dayFormatted}**<br/>` : `${dayFormatted}<br/>`
        
        if (imageUrl) {
          const fullHdUrl = modifyImageUrl(imageUrl, 'UHD')
          cellContent += `<a href="${fullHdUrl}" target="_blank"><img src="${imageUrl}" width="120" alt="${copyright || `Day ${day}`}"></a><br/>`
        } else {
          const placeholderUrl = generatePlaceholderImage(120, 68, '--', 'transparent', '666666')
          cellContent += `<img src="${placeholderUrl}" width="120" alt="Day ${day}"><br/>`
        }
        
        if (temp !== undefined && !isNaN(temp)) {
          const weatherIcon = weatherCode !== undefined ? getWeatherIcon(weatherCode) : '🌡️'
          cellContent += `${weatherIcon}${Math.round(temp)}°C`
        } else {
          cellContent += '🌡️--'
        }
        
        cellContent += '</div>'
        cells.push(cellContent)
      }
    }
    calendar += `| ${cells.join(' | ')} |\n`
  }
  
  return calendar
}

const generateMonthlyMarkdown = async (year, month, currentTemp = undefined, currentWeatherCode = undefined) => {
  try {
    const now = new Date()
    const targetYear = year ?? now.getFullYear()
    const targetMonth = month ?? now.getMonth()
    
    const { historicalData, forecastData } = await fetchWeatherData(targetYear, targetMonth)
    const { imageMap, copyrightMap } = loadBingData(targetYear, targetMonth)
    
    const highlightDay = (targetYear === now.getFullYear() && targetMonth === now.getMonth()) ? now.getDate() : null
    const calendar = generateCalendar(historicalData, forecastData, targetYear, targetMonth, highlightDay, imageMap, copyrightMap, currentTemp, currentWeatherCode)
    
    return `## 📅 ${MONTH_NAMES[targetMonth]} ${targetYear}\n\n${calendar}\n\n---\n\n📁 [View Archived Calendars](/archives/)\n`
  } catch (error) {
    console.error('Error generating monthly markdown:', error)
    return null
  }
}

const generateMonthCalendar = async (year, month, currentTemp = undefined, currentWeatherCode = undefined) => {
  console.log(`Generating calendar for ${year}-${month + 1}...`)
  const markdown = await generateMonthlyMarkdown(year, month, currentTemp, currentWeatherCode)
  if (markdown) {
    await saveMonthlyCalendar(year, month, markdown)
    console.log(`Calendar saved to archives/${year}-${String(month + 1).padStart(2, '0')}/README.md`)
  }
  return markdown
}

// ================= MAIN EXECUTION =================
const main = async () => {
  try {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth()
    const currentDay = now.getDate()
    
    console.log('Fetching latest wallpaper...')
    const latestWallpaper = await fetchLatestWallpaper()
    const updated = await updateWallpaperData(currentYear, currentMonth, latestWallpaper)
    console.log(updated ? 'Latest wallpaper added to current month data' : 'Wallpaper already exists or update failed')
    
    const baseParams = `latitude=${CONFIG.lat}&longitude=${CONFIG.lon}&timezone=${CONFIG.timezone}`
    const forecastUrl = `https://api.open-meteo.com/v1/forecast?${baseParams}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,visibility&hourly=temperature_2m,relative_humidity_2m,weather_code,visibility&forecast_days=7`
    
    const apiCalls = [fetch(forecastUrl)]
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1)
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0)

    if (currentDay > 1) {
      const start = formatDateForAPI(firstDayOfMonth)
      const end = formatDateForAPI(new Date(currentYear, currentMonth, currentDay - 1))
      apiCalls.push(fetch(`https://archive-api.open-meteo.com/v1/archive?${baseParams}&daily=temperature_2m_mean,weather_code&start_date=${start}&end_date=${end}`))
    }
    
    const forecastDays = Math.min(lastDayOfMonth.getDate() - currentDay + 1, 16)
    apiCalls.push(fetch(`https://api.open-meteo.com/v1/forecast?${baseParams}&daily=temperature_2m_mean,weather_code&forecast_days=${forecastDays}`))
    
    const responses = await Promise.all(apiCalls)
    const forecastData = await responses[0].json()
    
    const current = forecastData.current || {}
    const currentTemp = current.temperature_2m
    const currentWeatherCode = current.weather_code

    console.log('Generating monthly markdown...')
    const monthlyMarkdown = await generateMonthlyMarkdown(currentYear, currentMonth, currentTemp, currentWeatherCode)
    if (!monthlyMarkdown) throw new Error('Failed to generate monthly markdown')
    
    await saveMonthlyCalendar(currentYear, currentMonth, monthlyMarkdown)
    
    const nowHour = new Date()
    nowHour.setMinutes(0, 0, 0)
    
    const hourly = forecastData.hourly
    const hourlyTable = hourly?.time ? hourly.time
      .map((time, index) => {
        const hourDate = new Date(time)
        if (hourDate.getTime() < nowHour.getTime()) return null
        
        return `| ${formatDate(time)} | ${Math.round(hourly.temperature_2m[index])}℃ | ${hourly.relative_humidity_2m[index]}% | ${Math.round(hourly.visibility[index] / 1000)}km | ${getWeatherIcon(hourly.weather_code[index])} ${getWeatherCodeDescription(hourly.weather_code[index])} |`
      })
      .filter(Boolean)
      .join('\n') : '| No hourly data available | | | |'
    
    const templateData = {
      CURRENT_DATE: getCurrentDate(),
      TEMPERATURE: Math.round(current.temperature_2m),
      HUMIDITY: current.relative_humidity_2m,
      WIND_SPEED: Math.round(current.wind_speed_10m),
      VISIBILITY: Math.round(current.visibility / 1000),
      WEATHER_ICON: getWeatherIcon(current.weather_code),
      WEATHER_DESCRIPTION: getWeatherCodeDescription(current.weather_code),
      HOURLY_TABLE: hourlyTable.trim()
    }
    
    const finalContent = replacePlaceholders(loadTemplate(), templateData)
    const readmeWithMonthly = finalContent.replace('{{MONTHLY_CALENDAR}}', monthlyMarkdown)
    
    fs.writeFileSync(CONFIG.outputReadme, readmeWithMonthly)
    console.log('README.md updated successfully')
  } catch (error) {
    console.error('Error in main execution:', error)
  }
}

module.exports = {
  generateCalendar,
  generateMonthCalendar,
  getDaysInMonth,
  getFirstDayOfMonth,
  getWeatherIcon,
  generatePlaceholderImage,
  modifyImageUrl,
  loadBingData,
  saveMonthlyCalendar,
  loadMonthlyCalendar,
  updateWallpaperData,
  fetchLatestWallpaper
}

if (require.main === module) {
  main()
}