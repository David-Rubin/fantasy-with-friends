import { describe, it, expect } from 'vitest'
import { loginPathFor, postLoginTarget } from './loginRedirect'

describe('loginPathFor', () => {
  it('carries the wanted path in a tab nobody has signed in to', () => {
    expect(loginPathFor({ pathname: '/leagues/abc', tabHasHostedSignIn: false })).toBe(
      '/login?redirect=%2Fleagues%2Fabc'
    )
  })

  it('keeps the query string with the path', () => {
    expect(
      loginPathFor({ pathname: '/leagues/abc', search: '?invite=xyz', tabHasHostedSignIn: false })
    ).toBe('/login?redirect=%2Fleagues%2Fabc%3Finvite%3Dxyz')
  })

  it('drops the path once the tab has hosted someone', () => {
    expect(loginPathFor({ pathname: '/leagues/abc', tabHasHostedSignIn: true })).toBe('/login')
  })
})

describe('postLoginTarget', () => {
  it('follows a captured path in a fresh tab', () => {
    expect(postLoginTarget({ requested: '/leagues/abc', tabHasHostedSignIn: false })).toBe(
      '/leagues/abc'
    )
  })

  it('goes to the dashboard when nothing was asked for', () => {
    expect(postLoginTarget({ requested: null, tabHasHostedSignIn: false })).toBe('/dashboard')
    expect(postLoginTarget({ requested: '', tabHasHostedSignIn: false })).toBe('/dashboard')
  })

  it('ignores a path left over from whoever was in this tab before', () => {
    expect(postLoginTarget({ requested: '/leagues/abc', tabHasHostedSignIn: true })).toBe(
      '/dashboard'
    )
  })

  it('refuses to send anyone off this origin', () => {
    for (const requested of [
      '//evil.example/phish',
      'https://evil.example',
      'http://evil.example',
      '/\\evil.example',
      'javascript:alert(1)',
      'leagues/abc',
    ]) {
      expect(postLoginTarget({ requested, tabHasHostedSignIn: false })).toBe('/dashboard')
    }
  })
})
