import { mount } from 'svelte'
import App from './App.svelte'
import './app.css'
import { store } from './lib/state/store.svelte'

async function start() {
  await store.init()
  const app = mount(App, {
    target: document.getElementById('app'),
  })
  return app
}

export default start()
