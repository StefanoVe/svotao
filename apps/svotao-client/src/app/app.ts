import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { LiquidGlassContainer } from './components/liquid-glass-container/liquid-glass-container';
import { Nav } from './components/nav/nav';

@Component({
  imports: [RouterModule, LiquidGlassContainer, Nav],
  selector: 'svotao-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected title = 'svotao-client';
}
