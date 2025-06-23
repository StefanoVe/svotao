import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Nav } from './components/nav/nav';

@Component({
  imports: [RouterModule, Nav],
  selector: 'svotao-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected title = 'svotao-client';
}
